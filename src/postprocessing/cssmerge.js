/**
 * Post-processing module that consolidates CSS extracts into a single
 * structure. That structure is an object whose keys are `atrules`,
 * `functions`, `properties`, `selectors`, and `types`. Values are lists of CSS
 * constructs whose type matches the key.
 *
 * CSS constructs follow the same structure as that in individual CSS extracts
 * except that values that are listed under `values` in the CSS extracts are
 * not reported in the resulting structure because these values are a mix bag
 * of things in practice and specs do not consistently define values that a CSS
 * construct may take in any case.
 *
 * In CSS extracts, functions and types that are defined for another construct
 * appear under the `values` key of that construct entry. In the resulting
 * construct, they get copied to the root lists under `functions` or `types`,
 * and get a `for` key that contains the list of constructs that they are
 * defined for.
 *
 * CSS properties that are defined in one spec and extended in other specs get
 * consolidated into a single entry in the resulting structure. The syntax of
 * that single entry is the union (using `|`) of the syntaxes of each
 * definition.
 *
 * Similarly, at-rules that are defined in one spec and for which additional
 * descriptors get defined in other specs get consolidated into a single entry
 * in the resulting structure. The list of descriptors gets merged accordingly
 * (the order of descriptors is essentially arbitrary but then it is already
 * somewhat arbitrary in the initial CSS extracts).
 * 
 * When the syntax of an at-rule is defined in terms of `<declaration-list>` or
 * `<declaration-rule-list>`, the resulting syntax is "expanded" using the
 * syntax of the individual descriptors. For example, the syntax:
 * 
 *   `@property <custom-property-name> { <declaration-list> }`
 * 
 * becomes:
 * 
 *   `@property <custom-property-name> {
 *      [ syntax: [ <string> ]; ] ||
 *      [ inherits: [ true | false ]; ] ||
 *      [ initial-value: [ <declaration-value>? ]; ]
 *   }`
 *
 * When a CSS property is defined as a legacy alias of another one, its syntax
 * gets set to that of the other CSS property in the resulting structure.
 *
 * The structure roughly aligns with the structure followed in the MDN data
 * project at https://github.com/mdn/data on purpose, to ease comparison and
 * possible transition to Webref data. Main differences are:
 * - This code reports at-rules under `atrules`, MDN data uses `atRules`.
 * - This code uses arrays for lists, MDN data uses indexed objects.
 * - This code lists scoped definitions with a `for` key. MDN data only has
 * unscoped definitions.
 * - This code stores syntaxes in a `value` key, MDN data uses a `syntax` key.
 * - This code stores syntaxes of functions and types directly in the
 * `functions` and `types` lists. MDN data stores them in a separate `syntaxes`
 * category. The `syntaxes` view can be built by merging the `functions` and
 * `types` lists.
 * - This code keeps the surrounding `<>` for type names, MDN data does not.
 *
 * Module runs at the crawl level to create a `css.json` file.
 */

/**
 * CSS extracts have almost the right structure but mix functions and types
 * into a values namespace.
 */
const extractCategories = [
  'atrules',
  'properties',
  'selectors',
  'values'
];

export default {
  dependsOn: ['css'],
  input: 'crawl',
  property: 'css',

  run: async function (crawl, options) {
    // Final structure we're going to create
    const categorized = {
      atrules: [],
      functions: [],
      properties: [],
      selectors: [],
      types: []
    };
    const categories = Object.keys(categorized);

    // Let's fill out the final structure based on data from the CSS extracts
    for (const spec of crawl.results) {
      // Only consider specs that define some CSS
      if (!spec.css) {
        continue;
      }
      const data = spec.css;

      // We're going to merge features across specs, save the link back to
      // individual specs, we'll need that to de-duplicate entries
      decorateFeaturesWithSpec(data, spec);

      // Same categorization for at-rules, properties, and selectors
      categorized.atrules.push(...data.atrules);
      categorized.properties.push(...data.properties);
      categorized.selectors.push(...data.selectors);

      // Functions and types are merged in CSS extracts
      categorized.functions.push(...data.values.filter(v => v.type === 'function'));
      categorized.types.push(...data.values.filter(v => v.type === 'type'));

      // Copy scoped functions and types to the root level with a `for` key
      // to link back to the scoping feature
      for (const category of extractCategories) {
        for (const feature of data[category]) {
          if (feature.values) {
            const values = feature.values
              .map(v => Object.assign({ for: feature.name }, v));
            categorized.functions.push(
              ...values.filter(v => v.type === 'function'));
            categorized.types.push(
              ...values.filter(v => v.type === 'type'));
          }
        }
      }
    }

    // The job is "almost" done but we now need to de-duplicate entries.
    // Duplicated entries exist when:
    // - A property is defined in one spec and extended in other specs. We'll
    // consolidate the entries (and syntaxes) to get back to a single entry.
    // - An at-rule is defined in one spec. Additional descriptors are defined
    // in other specs. We'll consolidate the entries similarly.
    // - A feature is defined in one level of a spec series, and re-defined in
    // a subsequent level.
    //
    // And then, from time to time, specs define a function or type scoped to
    // another construct while a similar unscoped definition already exists.
    // The specs should get fixed (Strudy reports these problems already).
    // We'll ignore the scoped definitions here when an unscoped definition can
    // be used.
    //
    // To de-duplicate, we're going to take a live-on-the-edge perspective
    // and use definitions from the latest level in a series when there's a
    // choice.
    //
    // Notes:
    // - The code assumes that the possibility that a CSS construct gets
    // defined in multiple unrelated (i.e., not in the same series) specs has
    // already been taken care of through some sort of curation. It will pick
    // up a winner randomly if that happens.
    // - There is no duplication for scoped functions and types provided that
    // that the `for` key gets taken into account!)
    for (const category of categories) {
      // Create an index of feature definitions
      const featureDfns = {};
      for (const feature of categorized[category]) {
        // ... and since we're looping through features, let's get rid
        // of inner value definitions, which we no longer need
        // (interesting ones were already copied to the root level)
        if (feature.values) {
          delete feature.values;
        }
        for (const descriptor of feature.descriptors ?? []) {
          if (descriptor.values) {
            delete descriptor.values;
          }
        }

        const featureId = getFeatureId(feature);
        if (!featureDfns[featureId]) {
          featureDfns[featureId] = [];
        }
        featureDfns[featureId].push(feature);
      }

      // Identify the base definition for each feature, using the definition
      // (that has some known syntax) in the most recent level. Move that base
      // definition to the beginning of the array and get rid of other base
      // definitions.
      // (Note: the code chooses one definition if duplicates of base
      // definitions in unrelated specs still exist)
      for (const [name, dfns] of Object.entries(featureDfns)) {
        let actualDfns = dfns.filter(dfn => dfn.value);
        if (actualDfns.length === 0) {
          actualDfns = dfns.filter(dfn => !dfn.newValues);
        }
        const best = actualDfns.reduce((dfn1, dfn2) => {
          if (dfn1.spec.series.shortname !== dfn2.spec.series.shortname) {
            console.warn(`${name} is defined in unrelated specs ${dfn1.spec.shortname}, ${dfn2.spec.shortname}`);
            return dfn2;
          }
          if (dfn1.spec.seriesVersion < dfn2.spec.seriesVersion) {
            return dfn2;
          }
          else {
            return dfn1;
          }
        });
        featureDfns[name] = [best].concat(
          dfns.filter(dfn => !actualDfns.includes(dfn))
        );
      }

      // Apply extensions for properties and at-rules descriptors
      // (no extension mechanism for functions, selectors and types for now)
      // Note: there are delta specs of delta specs from time to time (e.g.,
      // `css-color`) and delta is not always a pure delta. In other words,
      // extension definitions may themselves be duplicated, we'll again
      // prefer the latest level in such cases.
      for (const [name, dfns] of Object.entries(featureDfns)) {
        const baseDfn = dfns[0];
        for (const dfn of dfns) {
          if (dfn === baseDfn) {
            continue;
          }
          if (baseDfn.value && dfn.newValues) {
            const newerDfn = dfns.find(d =>
              d !== dfn &&
              d.newValues === dfn.newValues &&
              d.spec.seriesVersion > dfn.spec.seriesVersion);
            if (newerDfn) {
              // The extension is redefined in a newer level, let's ignore
              // the older one
              continue;
            }
            baseDfn.value += ' | ' + dfn.newValues;
          }
          if (baseDfn.descriptors && dfn.descriptors?.length > 0) {
            baseDfn.descriptors.push(...dfn.descriptors.filter(desc => {
              // Look for a possible newer definition of the descriptor
              const newerDfn = dfns.find(d =>
                d !== dfn &&
                d.descriptors?.find(ddesc => ddesc.name === desc.name) &&
                d.spec.seriesVersion > dfn.spec.seriesVersion);
              return !newerDfn;
            }));
          }
        }
      }

      // All duplicates should have been treated somehow and merged into the
      // base definition. Use the base definition and get rid of the rest!
      // We will also generate an expanded syntax when possible for at-rules,
      // and drop scoped definitions when a suitable unscoped definition
      // already exists.
      categorized[category] = Object.entries(featureDfns)
        .map(([name, features]) => features[0])
        .filter(feature => {
          if (feature.for) {
            const unscoped = categorized[category].find(f =>
              f.name === feature.name && !f.for);
            if (unscoped) {
              // Only keep the scoped feature if it has a known syntax that
              // differs from the unscoped feature
              return feature.value && feature.value !== unscoped.value;
            }
          }
          return true;
        })
        .map(feature => {
          if (feature.descriptors?.length > 0 &&
              feature.value?.match(/{ <declaration-(rule-)?list> }/)) {
            // Note: More advanced logic would allow to get rid of enclosing
            // grouping constructs when there's no ambiguity. We'll stick to
            // simple logic for now.
            const syntax = feature.descriptors
              .map(desc => {
                if (desc.name.startsWith('@')) {
                  return `[ ${desc.value} ]`;
                }
                else {
                  return `[ ${desc.name}: [ ${desc.value} ]; ]`;
                }
              })
              .join(' ||\n  ');
            feature.value = feature.value.replace(
              /{ <declaration-(rule-)?list> }/,
              '{\n  ' + syntax + '\n}');
          }

          delete feature.spec;
          return feature;
        });

      // Various CSS properties are "legacy aliases of" another property. Use the
      // syntax of the other property for these.
      for (const feature of categorized[category]) {
        if (feature.legacyAliasOf && !feature.value) {
          const target = categorized[category].find(f =>
            f.name === feature.legacyAliasOf && !f.for);
          if (!target) {
            throw new Error(`${feature.name} is a legacy alias of unknown ${f.legacyAliasOf}`);
          }
          feature.value = target.value;
        }
      }

      // The same feature may be defined for multiple scopes.
      // To ease indexing and lookup by feature name, let's merge the scopes
      // when possible, turning the `for` key into an array. This will not get
      // rid of all scoping duplicates, but should still make the feature name
      // unique for all but a handful of them.
      categorized[category] = categorized[category]
        .map((feature, idx, list) => {
          const first = list.find(f => f.href === feature.href);
          if (first === feature) {
            if (feature.for) {
              feature.for = [feature.for];
            }
            return feature;
          }
          // Not the first time we see this feature, let's merge scopes.
          // Both scopes should be defined as there is no way to author a
          // single dfn that defines a feature both as scoped and unscoped.
          if (!first.for || !feature.for) {
            throw new Error(`Feature ${feature.name} defined both as unscoped and scoped within the same dfn, see ${feature.href}`);
          }
          first.for.push(feature.for);
          first.for.sort();
          return null;
        })
        .filter(feature => !!feature);

      // Let's sort lists before we return to ease human-readability and
      // avoid non-substantive diff
      for (const feature of categorized[category]) {
        if (feature.descriptors) {
          feature.descriptors.sort((d1, d2) => d1.name.localeCompare(d2.name));
        }
      }
      categorized[category].sort((f1, f2) =>
        getFeatureId(f1).localeCompare(getFeatureId(f2)));
    }

    return categorized;
  }
};


/**
 * Return the identifier of a feature, taking scoping construct(s) into account
 * when needed.
 */
function getFeatureId(feature) {
  let featureId = feature.name;
  if (feature.for) {
    featureId += ' for ' +
      (Array.isArray(feature.for) ? feature.for.join(',') : feature.for);
  }
  return featureId;
}


/**
 * Decorate all CSS features in the extract with the spec
 */
function decorateFeaturesWithSpec(data, spec) {
  for (const category of extractCategories) {
    for (const feature of data[category]) {
      feature.spec = spec;
      for (const value of feature.values ?? []) {
        value.spec = spec;
      }
    }
  }
}
