import informativeSelector from './informative-selector.mjs';
import getAbsoluteUrl from './get-absolute-url.mjs';


/**
 * Extract the list of CSS definitions in the current spec
 *
 * @function
 * @public 
 * @return {Promise} The promise to get an extract of the CSS definitions, or
 *   an empty CSS description object if the spec does not contain any CSS
 *   definition. The return object will have properties named "properties",
 *  "descriptors", "selectors" and "values".
 */
export default function () {
  // List of inconsistencies and errors found in the spec while trying to make
  // sense of the CSS definitions and production rules it contains
  const warnings = [];

  const dfnElSelector = ':is(dfn,h2,h3,h4,h5,h6)';

  const res = {
    // Properties are always defined in dedicated tables in modern CSS specs,
    // Legacy properties are always defined in prose in a dfn with a nearby
    // reference to "legacy name alias"
    properties: []
      .concat(extractDfns({
        selector: 'table.propdef:not(.attrdef)',
        extractor: extractTableDfns,
        duplicates: 'merge',
        warnings
      }))
      .concat(extractLegacyProperties(document)),

    // At-rules, selectors, functions and types are defined through dfns with
    // the right "data-dfn-type" attribute
    // Note some selectors are re-defined locally in HTML and Fullscreen. We
    // won't import them.
    atrules: extractDfns({
      selector: dfnElSelector + '[data-dfn-type=at-rule]:not([data-dfn-for])',
      extractor: extractTypedDfns,
      duplicates: 'reject',
      warnings
    }),
    selectors: extractDfns({
      selector: [dfnElSelector + '[data-dfn-type=selector][data-export]:not([data-dfn-for])',
                 dfnElSelector + '[data-dfn-type=selector][data-export][data-dfn-for=""]'
                ].join(','),
      extractor: extractTypedDfns,
      duplicates: 'reject',
      warnings
    }),
    values: extractDfns({
      selector: [dfnElSelector + '[data-dfn-type=function]:not([data-dfn-for])',
                 dfnElSelector + '[data-dfn-type=function][data-dfn-for=""]',
                 dfnElSelector + '[data-dfn-type=type]:not([data-dfn-for])',
                 dfnElSelector + '[data-dfn-type=type][data-dfn-for=""]'
                ].join(','),
      extractor: extractTypedDfns,
      duplicates: 'reject',
      keepDfnType: true,
      warnings
    })
  };

  // At-rules have descriptors, defined in dedicated tables in modern CSS specs
  // Note some of the descriptors are defined with a "type" property set to
  // "range". Not sure what the type of a descriptor is supposed to mean, but
  // let's keep that information around. One such example is the
  // "-webkit-device-pixel-ratio" descriptor for "@media" at-rule in compat:
  // https://compat.spec.whatwg.org/#css-media-queries-webkit-device-pixel-ratio
  let descriptors = extractDfns({
    selector: 'table.descdef:not(.attrdef)',
    extractor: extractTableDfns,
    duplicates: 'push',
    keepDfnType: true,
    warnings
  });

  // Older specs may follow older recipes, let's give them a try if we couldn't
  // extract properties or descriptors
  if (res.properties.length === 0 && descriptors.length === 0) {
    res.properties = extractDfns({
      selector: 'div.propdef dl',
      extractor: extractDlDfns,
      duplicates: 'merge',
      warnings
    });
    descriptors = extractDfns({
      selector: 'div.descdef dl',
      extractor: extractDlDfns,
      duplicates: 'push',
      warnings
    });
  }

  // Subsidiary at-rules are at-rules that can be used within a parent at-rule,
  // we'll consider that they are "descriptors".
  const subsidiary = extractDfns({
    selector: dfnElSelector + '[data-dfn-type=at-rule][data-dfn-for]',
    extractor: extractTypedDfns,
    duplicates: 'reject',
    keepDfnType: true,
    warnings
  });
  descriptors = descriptors.concat([subsidiary]);

  // Move descriptors, and subsidiary at-rules, to at-rules structure
  for (const desclist of descriptors) {
    for (const desc of desclist) {
      let rule = res.atrules.find(r => r.name === desc.for);
      if (rule) {
        if (!rule.descriptors) {
          rule.descriptors = [];
        }
      }
      else {
        rule = { name: desc.for, descriptors: [] };
        res.atrules.push(rule);
      }
      rule.descriptors.push(desc);
    }
  }
  for (const rule of res.atrules) {
    if (!rule.descriptors) {
      rule.descriptors = [];
    }
  }

  // Keep an index of "root" (non-namespaced + descriptors) dfns
  const rootDfns = Object.values(res).flat();
  for (const desclist of descriptors) {
    for (const desc of desclist) {
      rootDfns.push(desc);
    }
  }

  // Extract value dfns.
  // Note some of the values can be namespaced "function" or "type" dfns, such
  // as "<content-replacement>" in css-content-3:
  // https://drafts.csswg.org/css-content-3/#typedef-content-content-replacement
  const values = extractDfns({
    selector: [dfnElSelector + '[data-dfn-type=value][data-dfn-for]:not([data-dfn-for=""])',
               dfnElSelector + '[data-dfn-type=function][data-dfn-for]:not([data-dfn-for=""])',
               dfnElSelector + '[data-dfn-type=type][data-dfn-for]:not([data-dfn-for=""])',
               dfnElSelector + '[data-dfn-type=selector][data-dfn-for]:not([data-dfn-for=""])'
              ].join(','),
    extractor: extractTypedDfns,
    duplicates: 'push',
    keepDfnType: true,
    warnings
  }).flat();

  const matchName = (name, { approx = false } = {}) => dfn => {
    let res = dfn.name === name;
    if (!res && name.match(/^@.+\/.+$/)) {
      // Value reference might be for an at-rule descriptor:
      // https://tabatkins.github.io/bikeshed/#dfn-for
      const parts = name.split('/');
      res = dfn.name === parts[1] && dfn.for === parts[0];
    }
    if (!res && approx) {
      res = `<${dfn.name}>` === name;
    }
    return res;
  };

  // Extract production rules from pre.prod contructs
  // and complete result structure accordingly
  const rules = extractProductionRules(document);
  for (const rule of rules) {
    const dfn = rootDfns.find(matchName(rule.name)) ??
      rootDfns.find(matchName(rule.name, { approx: true }));
    if (dfn) {
      dfn.value = rule.value;
    }
    else {
      let matchingValues = values.filter(matchName(rule.name));
      if (matchingValues.length === 0) {
        matchingValues = values.filter(matchName(rule.name, { approx: true }));
      }
      for (const matchingValue of matchingValues) {
        matchingValue.value = rule.value;
      }
      if (matchingValues.length === 0) {
        // Dangling production rule. That should never happen for properties,
        // at-rules, descriptors: they should always be defined somewhere. That
        // happens from time to time for functions and types that are defined
        // in a spec and (temporarily) extended in another spec.
        if (rule.name.match(/^<.*>$/)) {
          const isFunction = !!rule.name.match(/\(\)/);
          res.values.push({
            name: isFunction ? rule.name.replace(/^<(.*)>$/, '$1') : rule.name,
            type: isFunction ? 'function' : 'type',
            value: rule.value
          });
        }
        else {
          if (!res.warnings) {
            res.warnings = [];
          }
          const warning = Object.assign({ msg: 'Missing definition' }, rule);
          warnings.push(warning);
          rootDfns.push(warning);
        }
      }
    }
  }

  // We now need to associate values with dfns. CSS specs tend to list in
  // "data-dfn-for" attributes of values the construct to which the value
  // applies directly but also the constructs to which the value indirectly
  // applies. For instance, "open-quote" in css-content-3 directly applies to
  // "<quote>" and indirectly applies to "<content-list>" (which has "<quote>"
  // in its value syntax) and to "content" (which has "<content-list>" in its
  // value syntax), and all 3 appear in the "data-dfn-for" attribute:
  // https://drafts.csswg.org/css-content-3/#valdef-content-open-quote
  //
  // To make it easier to make sense of the extracted data and avoid duplicates
  // in the resulting structure, the goal is to only keep the constructs to
  // which the value applies directly. In the previous example, the goal is to
  // list "open-quote" under "<quote>" but not under "<content-list>" and
  // "<content>".

  // Start by looking at values that are "for" something. Their list of parents
  // appears in the "data-dfn-for" attribute of their definition.
  const parents = {};
  for (const value of values) {
    if (!parents[value.name]) {
      parents[value.name] = [];
    }
    parents[value.name].push(...value.for.split(',').map(ref => ref.trim()));
  }

  // Then look at non-namespaced types and functions. Their list of parents
  // are all the definitions whose values reference them (for instance,
  // "<quote>" has "<content-list>" as parent because "<content-list>" has
  // "<quote>" in its value syntax).
  for (const type of res.values) {
    if (!parents[type.name]) {
      parents[type.name] = [];
    }
    for (const value of values) {
      if (value.value?.includes(type.name)) {
        parents[type.name].push(value.name);
      }
    }
    for (const dfn of rootDfns) {
      if (dfn.value?.includes(type.name)) {
        parents[type.name].push(dfn.name);
      }
    }
  }

  // Helper functions to reason on the parents index we just created.
  // Note there may be cycles. For instance, in CSS Images 4, <image> references
  // <image-set()>, which references <image-set-option>, which references
  // <image> again:
  // https://drafts.csswg.org/css-images-4/#typedef-image
  const isAncestorOf = (ancestor, child) => {
    const checkChild = (c, depth) =>
      (depth++ < 10) &&
      (c === ancestor || parents[c]?.find(p => checkChild(p, depth)));
    return checkChild(child, 0);
  };
  const isDeepestConstruct = (name, list) => {
    return list.every(p => p === name || !isAncestorOf(name, p));
  }

  // We may now associate values with dfns
  for (const value of values) {
    value.for.split(',')
      .map(ref => ref.trim())
      .filter((ref, _, arr) => isDeepestConstruct(ref, arr))
      .forEach(ref => {
        // Look for the referenced definition in root dfns
        const dfn = rootDfns.find(matchName(ref)) ??
          rootDfns.find(matchName(ref, { approx: true }));
        if (dfn) {
          if (!dfn.values) {
            dfn.values = [];
          }
          dfn.values.push(value);
        }
        else {
          // If the referenced definition is not in root dfns, look in
          // namespaced dfns as functions/types are sometimes namespaced to a
          // property, and values may reference these functions/types.
          let referencedValues = values.filter(matchName(ref));
          if (referencedValues.length === 0) {
            referencedValues = values.filter(matchName(ref, { approx: true }));
          }
          for (const referencedValue of referencedValues) {
            if (!referencedValue.values) {
              referencedValue.values = [];
            }
            referencedValue.values.push(value);
          }

          if (referencedValues.length === 0) {
            warnings.push(Object.assign(
              { msg: 'Dangling value' },
              value,
              { for: ref }
            ));
          }
        }
      });
  }

  // Don't keep the info on whether value comes from a pure syntax section
  for (const dfn of rootDfns) {
    delete dfn.pureSyntax;
  }
  for (const value of values) {
    delete value.for;
    delete value.pureSyntax;
  }

  // Specs typically do not make the syntax of selectors such as `:visited`
  // explicit because it essentially goes without saying: the syntax is the
  // selector's name itself. One nuance is that, for combinators such as `||`,
  // tokens needs to be enclosed in single-quotes for the syntax to be valid.
  // Note the syntax of selectors that are function-like such as `:nth-child()`
  // cannot be inferred in the same way.
  function setValueFromName(selector) {
    if (selector.value) {
      return;
    }
    if (selector.name.match(/\(/)) {
      // Function-like selector
      return;
    }
    if (selector.name.match(/^[:a-z]/i)) {
      // Keyword-like selector that is not a combinator
      selector.value = selector.name;
    }
    else {
      // Combinator, let's enclose tokens in single-quotes
      const tokens = selector.name.split('');
      if (tokens.length === 1) {
        selector.value = `'${tokens[0]}'`;
      }
      else {
        selector.value = tokens.map(token => `'${token}'`).join(' ');
      }
    }
  }
  for (const selector of res.selectors) {
    setValueFromName(selector);
    for (const subSelector of selector.values ?? []) {
      setValueFromName(subSelector);
    }
  }

  // Report warnings
  if (warnings.length > 0) {
    res.warnings = warnings;
  }

  return res;
}


/**
 * Normalize value definitions extracted from specs
 *
 * In particular, replace minus characters that may appear in values:
 * https://github.com/tabatkins/bikeshed/issues/2308
 *
 * @param {String} value Value to normalize
 * @return {String} Normalized value
 */
const normalize = value => value.trim().replace(/\s+/g, ' ').replace(/−/g, '-');


/**
 * Converts a definition label as it appears in a CSS spec to a lower camel
 * case property name.
 *
 * @param  {String} label Definition label
 * @return {String} lower camel case property name for the label
 */
const dfnLabel2Property = label => label.trim()
  .replace(/:/, '')
  .split(' ')
  .map((str, idx) => (idx === 0) ?
    str.toLowerCase() :
    str.charAt(0).toUpperCase() + str.slice(1))
  .join('')
  // Spec may use singular when there is only one new value
  // (e.g. new value of "text-transform" in MathML Core)
  .replace(/^newValue$/, 'newValues');


/**
 * Selector to use to exclude inner blocks that list tests, references and/or
 * link to implementation statuses, which would provide too much detailed info
 * in prose content.
 */
const asideSelector = 'aside, .mdn-anno, .wpt-tests-block';


/**
 * Extract CSS definitions from a table.
 *
 * Tables often contain one CSS definition, but they may actual contain a whole
 * list of them, as in:
 * https://drafts.csswg.org/css-borders-4/#corner-sizing-side-shorthands
 *
 * The "Name" line contains the list of definitions, the other lines are the
 * properties shared by all of these definitions.
 *
 * All recent CSS specs should follow that pattern.
 */
const extractTableDfns = table => {
  // Remove annotations that we do not want to extract
  const tableCopy = table.cloneNode(true);
  const annotations = tableCopy.querySelectorAll(asideSelector);
  annotations.forEach(n => n.remove());

  let res = [];
  const properties = [...table.querySelectorAll('tr')]
    .map(line => {
      const nameEl = line.querySelector(':first-child');
      const valueEl = line.querySelector('td:last-child');
      if (!nameEl || !valueEl) {
        return null;
      }
      const propName = dfnLabel2Property(nameEl.textContent);
      if (propName === 'name') {
        const dfns = [...valueEl.querySelectorAll('dfn[id]')];
        if (dfns.length > 0) {
          res = dfns.map(dfn => Object.assign({
            name: normalize(dfn.textContent),
            href: getAbsoluteUrl(dfn)
          }));
        }
        else {
          // Some tables may not have proper dfns, we won't be able to extract
          // IDs, but we can still extract the text
          const value = normalize(valueEl.textContent);
          res = value.split(',').map(name => Object.assign({
            name: name.trim()
          }));
        }
        return null;
      }
      else if (propName) {
        return {
          name: propName,
          value: normalize(valueEl.textContent)
        };
      }
      else {
        return null;
      }
    })
    .filter(property => !!property);

  for (const dfn of res) {
    for (const property of properties) {
      dfn[property.name] = property.value;
    }
  }
  return res;
};


/**
 * Extract CSS definitions from a dl list.
 *
 * As with tables, a dl list often contains one CSS definition, but it may
 * contain a whole list of them, as in:
 * https://www.w3.org/TR/CSS21/box.html#border-width-properties
 *
 * Used in "old" CSS specs.
 */
const extractDlDfns = dl => {
  let res = [];
  const dfns = [...dl.querySelectorAll('dt:first-child dfn[id],dt:first-child a[name]')];
  if (dfns.length > 0) {
    res = dfns.map(dfn => Object.assign({
      name: normalize(dfn.textContent.replace(/'/g, '')),
      href: getAbsoluteUrl(dfn, { attribute: dfn.id ? 'id' : 'name' })
    }));
  }
  else {
    // Markup does not use definitions, let's look for an ID in the dt itself
    const dt = dl.querySelector('dt');
    if (dt.id) {
      res = [{
        name: normalize(dt.textContent.replace(/'/g, '')),
        href: getAbsoluteUrl(dt)
      }];
    }
    else {
      res = dt.textContent.split(',').map(name => Object.assign({
        name: normalize(name.replace(/'/g, ''))
      }));
    }
  }

  const properties = [...dl.querySelectorAll('dd table tr')]
    .map(line => Object.assign({
      name: dfnLabel2Property(line.querySelector(':first-child').textContent),
      value: normalize(line.querySelector('td:last-child').textContent)
    }));
  for (const dfn of res) {
    for (const property of properties) {
      dfn[property.name] = property.value;
    }
  }
  return res;
};


/**
 * Merges CSS definitions for the same property into one
 *
 * The function runs a few simple sanity checks on the definitions. More checks
 * would be needed to fully validate that merging is fine.
 *
 * The function returns null if CSS definitions cannot be merged.
 */
const mergeDfns = (dfn1, dfn2) => {
  // Definitions should be about the same property
  if (dfn1.name !== dfn2.name) {
    return null;
  }

  // There should never be two base definitions for the same CSS property
  if (dfn1.value && dfn2.value) {
    return null;
  }

  const [baseDfn, partialDfn] = dfn2.value ? [dfn2, dfn1] : [dfn1, dfn2];
  if ((!baseDfn.value && !baseDfn.newValues) ||
      !partialDfn.newValues ||
      (partialDfn.initial && partialDfn.initial !== baseDfn.initial)) {
    return null;
  }

  const merged = Object.assign(baseDfn);
  if (merged.value) {
    merged.value += ` | ${normalize(partialDfn.newValues)}`;
  }
  else {
    merged.newValues += ` | ${normalize(partialDfn.newValues)}`;
  }

  return merged;
};


/**
 * Extract CSS definitions in a spec using the given CSS selector and extractor
 *
 * The "duplicates" option controls the behavior of the function when it
 * encounters a duplicate (or similar) definition for the same thing. Values
 * may be "reject" to report a warning, "merge" to merge the definitions, and
 * "push" to keep both definitions separated.
 *
 * Merge issues and unexpected duplicates get reported as warnings in the
 * "warnings" array passed as parameter.
 */
const extractDfns = ({ root = document,
                       selector,
                       extractor,
                       duplicates = 'reject',
                       keepDfnType = false,
                       warnings = [] }) => {
  const res = [];
  [...root.querySelectorAll(selector)]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => !el.querySelector('ins, del'))
    .map(extractor)
    .map(dfns => Array.isArray(dfns) ? dfns : [dfns])
    .reduce((acc, val) => acc.concat(val), [])
    .filter(dfn => !!dfn?.name)
    .forEach(dfn => {
      if (dfn.type && !keepDfnType) {
        delete dfn.type;
      }
      const idx = res.findIndex(e => e.name === dfn.name);
      if (idx >= 0) {
        switch (duplicates) {
        case 'merge':
          const merged = mergeDfns(res[idx], dfn);
          if (merged) {
            res[idx] = merged;
          }
          else {
            warnings.push(Object.assign(
              { msg: 'Unmergeable definition' },
              dfn
            ));
          }
          break;

        case 'push':
          res[idx].push(dfn);

        default:
          warnings.push(Object.assign(
            { msg: 'Duplicate definition' },
            dfn
          ));
        }
      }
      else {
        res.push(duplicates !== 'push' ? dfn : [dfn]);
      }
    });
  return res;
};


/**
 * Regular expression used to split production rules:
 * Split on the space that precedes a term immediately before an equal sign
 * that is not wrapped in quotes (an equal sign wrapped in quotes is part of
 * actual value syntax).
 *
 * The definition of term used to be "something without spaces"... but
 * css-values-5 introduces `<boolean-expr[ <test> ]>` as left-hand side of a
 * production rule, forcing the regular expression to be more complex:
 *
 * - `[^\]\s]+?`: any term without space and without `]` (to avoid matching on
 * `]>` at the end of `<boolean-expr[ <test> ]>`). Note: if `<]-token>` (only
 * other type with a `]` at the time of writing) ever ends up appearing as the
 * left-hand side of a production rule, the expression would miss it:
 * https://drafts.csswg.org/css-syntax-3/#tokendef-close-square
 * Not going to happen, right?
 * - `<.*?\[\s*<.*?>\s*\]>`: any term of the form `<foo[ <bar> ]>`.
 */
const reSplitRules = /\s(?=(?:[^\]\s]+?|<.*?\[\s*<.*?>\s*\]>)\s*?=[^'])/;


/**
 * Regular expression used to identify a production rule
 */
const reProductionRule = /\s?=\s/;


/**
 * Helper function to parse a production rule. The "pureSyntax" parameter
 * should be set to indicate that the rule comes from a pure syntactic block
 * and should have precedence over another value definition that may be
 * extracted from the prose. For instance, this makes it possible to extract
 * `<abs()> = abs( <calc-sum> )` from the syntax part in CSS Values instead
 * of `<abs()> = abs(A)` which is how the function is defined in prose.
 */
const parseProductionRule = (rule, { res = [], pureSyntax = false }) => {
  const nameAndValue = rule
    .replace(/\/\*[^]*?\*\//gm, '')  // Drop comments
    .split(reProductionRule)
    .map(s => s.trim().replace(/\s+/g, ' '));

  // Note: we get rid of the "parameter" in `<boolean-expr[ <test> ]>` to get
  // back to `<boolean-expr>` as type name.
  const name = nameAndValue[0].replace(/\[[^\]]+\]/, '');
  const value = nameAndValue[1];

  const normalizedValue = normalize(value);
  let entry = res.find(e => e.name === name);
  if (!entry) {
    entry = { name };
    res.push(entry);
  }
  if (!entry.value || (pureSyntax && !entry.pureSyntax)) {
    entry.value = normalizedValue;
    entry.pureSyntax = pureSyntax;
  }
  else if (entry.value !== normalizedValue) {
    // Second definition found. Typically happens for the statement and
    // block @layer definitions in css-cascade-5. We'll combine the values
    // as alternative.
    entry.value += ` | ${normalizedValue}`;
  }

  return entry;
};


/**
 * Extract the definition names. If multiple linking texts are possible, the
 * function will select the ones that are "syntax" definition. For instance, it
 * will pick up "<identifier>" for "identifiers|<identifier>" in CSS 2:
 * https://drafts.csswg.org/css2/#value-def-identifier
 *
 * Another example is ":lang" and ":lang()" in CSS 2 as well, the latter being
 * the proper syntax definition:
 * https://drafts.csswg.org/css2/#selectordef-lang
 */
const getDfnNames = dfn => {
  const names = dfn.getAttribute('data-lt') ?
    dfn.getAttribute('data-lt').split('|').map(normalize) :
    [dfn.textContent.trim()];
  const regAtRule = /^@/;
  const regFunction = /\(\)$/;
  const regSelector = /^:/;
  const regType = /^<.*>$/;
  const isKeywordOrPropertyName = names.every(name => !(
    name.match(regAtRule) ||
    name.match(regFunction) ||
    name.match(regType) ||
    name.match(regSelector))
  );
  return names.filter(name =>
    name.match(regAtRule) ||
    name.match(regFunction) ||
    name.match(regType) ||
    (name.match(regSelector) &&
      !names.find(lt => lt.match(regFunction))) ||
    isKeywordOrPropertyName
  );
}


/**
 * Extract the given dfn
 */
const extractTypedDfns = dfn => {
  const dfns = [];
  const arr = [];
  const dfnType = dfn.getAttribute('data-dfn-type');
  const dfnFor = dfn.getAttribute('data-dfn-for');
  // Note there's no point going beyond a heading, especially since parent is
  // likely going to be an entire section or even the whole document body.
  const parent = (dfn.tagName.startsWith('H') ? dfn : dfn.parentNode)
    .cloneNode(true);
  const fnRegExp = /^([:a-zA-Z_][:a-zA-Z0-9_\-]+)\([^\)]*\)$/;

  // Remove note references as in:
  // https://drafts.csswg.org/css-syntax-3/#the-anb-type
  // and remove MDN annotations as well
  [...parent.querySelectorAll('sup')]
    .map(sup => sup.parentNode.removeChild(sup));
  [...parent.querySelectorAll(asideSelector)]
    .map(annotation => annotation.parentNode.removeChild(annotation));

  // A single dfn can define multiple terms through `data-lt` attributes, e.g.,
  // https://drafts.csswg.org/css-values-5/#typedef-calc-interpolate-input-position
  // That is typically used to make the prose more readable (and the above link
  // is the only known case at the time of writing).
  const dfnNames = getDfnNames(dfn);

  const text = parent.textContent.trim();
  for (const dfnName of dfnNames) {
    let res = { name: dfnName };
    if (text.match(reProductionRule)) {
      // Definition appears in a "prod = foo" text, that's all good
      // ... except in css-easing-2 draft where text also contains another
      // production rule as a child of the first one:
      // https://drafts.csswg.org/css-easing-2/#typedef-step-easing-function
      const prod = text.split(reSplitRules)
          .find(p => p.trim().startsWith(dfn.textContent.trim()));
      if (dfn.closest('pre')) {
        // Don't attempt to parse pre tags at this stage, they are tricky to
        // split, we'll parse them as text and map them to the right definitions
        // afterwards.
        // That said, we may be looking at a function definition on the right hand
        // side of a production rule, as in the definition of "linear()" in
        // css-easing-2: https://drafts.csswg.org/css-easing-2/#funcdef-linear
        // In such a case, we still want to extract the function parameters
        if (dfnName.match(fnRegExp)) {
          const fn = dfnName.match(fnRegExp)[1];
          const fullFn = dfn.textContent.trim();
          if (fullFn.startsWith(fn + '(')) {
            res = parseProductionRule(`${fn}() = ${fullFn}`, { pureSyntax: false });
          }
        }
      }
      else if (prod) {
        res = parseProductionRule(prod, { pureSyntax: true });
      }
      else {
        // "=" may appear in another formula in the body of the text, as in:
        // https://drafts.csswg.org/css-speech-1/#typedef-voice-volume-decibel
        // It may be worth checking but not an error per se.
        console.warn('[reffy]', `Found "=" next to definition of ${dfnName} but no production rule. Did I miss something?`);
        res = { name: dfnName, prose: text.replace(/\s+/g, ' ') };
      }
    }
    else if (dfnName.match(fnRegExp)) {
      // Definition is "prod(foo bar)", create a "prod() = prod(foo bar)" entry
      // unless the definition fails to provide function parameters
      const fn = dfnName.match(fnRegExp)[1];
      const fullFn = dfn.textContent.trim();
      if (fullFn.startsWith(fn + '(') && fullFn !== `${fn}()`) {
        res = parseProductionRule(`${fn}() = ${dfn.textContent.trim()}`, { pureSyntax: false });
      }
    }
    else if (parent.nodeName === 'DT') {
      // Definition is in a <dt>, look for value in following <dd>
      let dd = dfn.parentNode;
      while (dd && (dd.nodeName !== 'DD')) {
        dd = dd.nextSibling;
      }
      if (!dd) {
        continue;
      }
      const code = dd.querySelector('code.prod, pre.prod');
      if (code && !code.closest(informativeSelector)) {
        if (code.textContent.startsWith(`${dfnName} = `) ||
            code.textContent.startsWith(`<${dfnName}> = `)) {
          res = parseProductionRule(code.textContent, { pureSyntax: true });
        }
        else if (!code.textContent.match(reProductionRule)) {
          res = parseProductionRule(`${dfnName} = ${code.textContent}`, { pureSyntax: false });
        }
      }
      else {
        // Remove notes, details sections that link to tests, and subsections
        // that go too much into details
        dd = dd.cloneNode(true);
        [...dd.children].forEach(c => {
          if (c.tagName === 'DETAILS' ||
              c.tagName === 'DL' ||
              c.classList.contains('note')) {
            c.remove();
          }
        });
        [...dd.querySelectorAll('sup')]
          .map(sup => sup.parentNode.removeChild(sup));
        [...dd.querySelectorAll(asideSelector)]
          .map(annotation => annotation.parentNode.removeChild(annotation));

        res = {
          name: dfnName,
          prose: dd.textContent.trim().replace(/\s+/g, ' ')
        };
      }
    }

    if (!res.value && parent.nodeName === 'P') {
      // Definition is in regular prose, extract value from prose.
      res.prose = parent.textContent.trim().replace(/\s+/g, ' ');
    }
    if (dfn.id) {
      res.href = getAbsoluteUrl(dfn);
    }
    res.type = dfnType;
    if (dfnType === 'value') {
      res.value = normalize(res.name);
    }
    if (dfnFor) {
      res.for = dfnFor;
    }
    dfns.push(res);
  }

  return dfns;
};

/**
 * Extract production rules defined in the specification in "<pre>" tags and
 * complete the result structure received as parameter accordingly.
 */
const extractProductionRules = root => {
  // For <pre> tags that don't have a "prod" class (e.g. in HTML and
  // css-namespaces), make sure they contain a <dfn> with a valid CSS
  // data-dfn-type attribute to avoid parsing things that are not production
  // rules. In all cases, make sure we're not in a changelog with details as in:
  // https://drafts.csswg.org/css-backgrounds-3/#changes-2017-10
  const rules = [];
  [...root.querySelectorAll('pre.prod:not(:has(del,ins))')]
    .concat([...root.querySelectorAll('pre:not(.prod,.idl,:has(.idl,del,ins))')]
      .filter(el => el.querySelector([
        'dfn[data-dfn-type=at-rule]',
        'dfn[data-dfn-type=selector]',
        'dfn[data-dfn-type=value]',
        'dfn[data-dfn-type=function]',
        'dfn[data-dfn-type=type]'
      ].join(','))))
    .filter(el => !el.closest(informativeSelector))
    .map(el => el.cloneNode(true))
    .map(el => {
      [...el.querySelectorAll(asideSelector)]
        .map(aside => aside.parentNode.removeChild(aside));
      return el;
    })
    .map(el => {
      [...el.querySelectorAll('sup')]
        .map(sup => sup.parentNode.removeChild(sup));
      return el;
    })
    .map(el => el.textContent)
    .map(val => val.replace(/\/\*[^]*?\*\//gm, ''))  // Drop comments
    .map(val => val.split(reSplitRules))             // Separate definitions
    .flat()
    .map(text => text.trim())
    .forEach(text => {
      if (text.match(reProductionRule)) {
        parseProductionRule(text, { res: rules, pureSyntax: true });
      }
      else if (text.startsWith('@')) {
        const name = text.split(' ')[0];
        parseProductionRule(`${name} = ${text}`, { res: rules, pureSyntax: true });
      }
    });

  return rules;
}


/**
 * Extract legacy alias relationships, looking for occurrences of the term
 * "legacy name alias".
 *
 * Next to it, there should be:
 * 1. a dfn for a property followed by a reference to the aliased property; or
 * 2. a table with two columns: dfns in the first column, references to the
 * aliased properties in the second column.
 */
const extractLegacyProperties = doc =>
  [...doc.querySelectorAll('a[href$="#legacy-name-alias"]')]
    .map(el => el.parentElement)
    .map(el => {
      const dfn = el.querySelector('dfn[data-dfn-type="property"]');
      const alias = el.querySelector('a[data-link-type="property"]');
      if (dfn && alias) {
        // Aliasing is defined in prose
        return {
          name: normalize(dfn.textContent),
          href: getAbsoluteUrl(dfn),
          legacyAliasOf: normalize(alias.textContent)
        };
      }
      else {
        // Look for a compat table right after the paragraph
        const table = el.nextElementSibling;
        if (table?.nodeName !== 'TABLE') {
          return null;
        }
        if ([...table.querySelectorAll('thead > tr > th')].length !== 2) {
          return null;
        }
        return [...table.querySelectorAll('tbody > tr')]
          .map(row => {
            const dfn = row.querySelector('dfn[data-dfn-type="property"]');
            const alias = row.querySelector('a[data-link-type="property"]');
            if (dfn && alias) {
              return {
                name: normalize(dfn.textContent),
                href: getAbsoluteUrl(dfn),
                legacyAliasOf: normalize(alias.textContent)
              };
            }
            else {
              return null;
            }
          });
      }
    })
    .flat()
    .filter(prop => !!prop);
