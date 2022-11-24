import informativeSelector from './informative-selector.mjs';

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

  const res = {
    // Properties are always defined in dedicated tables in modern CSS specs
    properties: extractDfns({
      selector: 'table.propdef:not(.attrdef)',
      extractor: extractTableDfn,
      duplicates: 'merge',
      mayReturnMultipleDfns: true,
      warnings
    }),

    // At-rules, selectors, functions and types are defined through dfns with
    // the right "data-dfn-type" attribute
    // Note some selectors are re-defined locally in HTML and Fullscreen. We
    // won't import them.
    atrules: extractDfns({
      selector: 'dfn[data-dfn-type=at-rule]',
      extractor: extractTypedDfn,
      duplicates: 'reject',
      warnings
    }),
    selectors: extractDfns({
      selector: 'dfn[data-dfn-type=selector][data-export]',
      extractor: extractTypedDfn,
      duplicates: 'reject',
      warnings
    }),
    values: extractDfns({
      selector: ['dfn[data-dfn-type=function]:not([data-dfn-for])',
                 'dfn[data-dfn-type=function][data-dfn-for=""]',
                 'dfn[data-dfn-type=type]:not([data-dfn-for])',
                 'dfn[data-dfn-type=type][data-dfn-for=""]'
                ].join(','),
      extractor: extractTypedDfn,
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
    extractor: extractTableDfn,
    duplicates: 'push',
    mayReturnMultipleDfns: true,
    keepDfnType: true,
    warnings
  });

  // Older specs may follow older recipes, let's give them a try if we couldn't
  // extract properties or descriptors
  if (res.properties.length === 0 && descriptors.length === 0) {
    res.properties = extractDfns({
      selector: 'div.propdef dl',
      extractor: extractDlDfn,
      duplicates: 'merge',
      mayReturnMultipleDfns: true,
      warnings
    });
    descriptors = extractDfns({
      selector: 'div.descdef dl',
      extractor: extractDlDfn,
      duplicates: 'push',
      mayReturnMultipleDfns: true,
      warnings
    });
  }

  // Move descriptors to at-rules structure
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
    selector: ['dfn[data-dfn-type=value][data-dfn-for]:not([data-dfn-for=""])',
               'dfn[data-dfn-type=function][data-dfn-for]:not([data-dfn-for=""])',
               'dfn[data-dfn-type=type][data-dfn-for]:not([data-dfn-for=""])'
              ].join(','),
    extractor: extractTypedDfn,
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
      if (rule.legacyValue) {
        dfn.legacyValue = rule.legacyValue;
      }
    }
    else {
      let matchingValues = values.filter(matchName(rule.name));
      if (matchingValues.length === 0) {
        matchingValues = values.filter(matchName(rule.name, { approx: true }));
      }
      for (const matchingValue of matchingValues) {
        matchingValue.value = rule.value;
        if (rule.legacyValue) {
          matchingValue.legacyValue = rule.legacyValue;
        }
      }
      if (matchingValues.length === 0) {
        // Dangling production rule. That should never happen for properties,
        // at-rules, descriptors and functions, since they should always be
        // defined somewhere. That happens from time to time for types that are
        // described in prose and that don't have a dfn. One could perhaps argue
        // that these constructs ought to have a dfn too.
        if (!res.warnings) {
          res.warnings = []
        }
        const warning = Object.assign({ msg: 'Missing definition' }, rule);
        warnings.push(warning);
        rootDfns.push(warning);
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
    let seen = [];
    const checkChild = c => {
      let res = ancestor === c;
      if (!res) {
        res = parents[c]
          ?.filter(p => !seen.includes(p))
          ?.find(p => checkChild(ancestor, p));
      }
      seen = seen.concat(parents[c]);
      return res;
    }
    return checkChild(child);
  };
  const isDeepestConstruct = (name, list) =>
    list.every(p => p === name || !isAncestorOf(name, p));

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
  .join('');


/**
 * Extract a CSS definition from a table
 *
 * All recent CSS specs should follow that pattern
 */
const extractTableDfn = table => {
  let res = {};
  const lines = [...table.querySelectorAll('tr')]
    .map(line => {
      const cleanedLine = line.cloneNode(true);
      const annotations = cleanedLine.querySelectorAll("aside, .mdn-anno");
      annotations.forEach(n => n.remove());
      return {
        name: dfnLabel2Property(cleanedLine.querySelector(':first-child').textContent),
        value: normalize(cleanedLine.querySelector('td:last-child').textContent)
      };
    });
  for (let prop of lines) {
    res[prop.name] = prop.value;
  }
  return res;
};


/**
 * Extract a CSS definition from a dl list
 *
 * Used in "old" CSS specs
 */
const extractDlDfn = dl => {
  let res = {};
  res.name = dl.querySelector('dt').textContent.replace(/'/g, '').trim();
  const lines = [...dl.querySelectorAll('dd table tr')]
    .map(line => Object.assign({
      name: dfnLabel2Property(line.querySelector(':first-child').textContent),
      value: normalize(line.querySelector('td:last-child').textContent)
    }));
  for (let prop of lines) {
    res[prop.name] = prop.value;
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
                       mayReturnMultipleDfns = false,
                       keepDfnType = false,
                       warnings = [] }) => {
  const res = [];
  [...root.querySelectorAll(selector)]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => !el.querySelector('ins, del'))
    .map(extractor)
    .filter(dfn => !!dfn?.name)
    .map(dfn => !mayReturnMultipleDfns ? [dfn] :
      dfn.name.split(',').map(name => Object.assign({}, dfn, { name: name.trim() })))
    .reduce((acc, val) => acc.concat(val), [])
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
 * actual value syntax)
 */
const reSplitRules = /\s(?=[^\s]+?\s*?=[^'])/;


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
    .split(/\s?=\s/)
    .map(s => s.trim().replace(/\s+/g, ' '));

  const name = nameAndValue[0];
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
    // Hardcoded exception: re-definitions of rgb() and hsl() are legacy
    // constructs, stored separately not to pollute `value`.
    if (name === '<rgb()>' || name === '<hsl()>') {
      entry.legacyValue = normalizedValue;
    }
    else {
      entry.value += ` | ${normalizedValue}`;
    }
  }

  return entry;
};


/**
 * Extract the given dfn
 */
const extractTypedDfn = dfn => {
  let res = {};
  const arr = [];
  const dfnType = dfn.getAttribute('data-dfn-type');
  const dfnFor = dfn.getAttribute('data-dfn-for');
  const parent = dfn.parentNode.cloneNode(true);

  // Remove note references as in:
  // https://drafts.csswg.org/css-syntax-3/#the-anb-type
  // and remove MDN annotations as well
  [...parent.querySelectorAll('sup')]
    .map(sup => sup.parentNode.removeChild(sup));
  [...parent.querySelectorAll('aside, .mdn-anno')]
    .map(annotation => annotation.parentNode.removeChild(annotation));

  const text = parent.textContent.trim();
  if (text.match(/\s?=\s/)) {
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
      const name = (dfn.getAttribute('data-lt') ?? dfn.textContent).trim();
      res = { name };
    }
    else if (prod) {
      res = parseProductionRule(prod, { pureSyntax: true });
    }
    else {
      // "=" may appear in another formula in the body of the text, as in:
      // https://drafts.csswg.org/css-speech-1/#typedef-voice-volume-decibel
      // It may be worth checking but not an error per se.
      console.warn('[reffy]', `Found "=" next to definition of ${dfn.textContent.trim()} but no production rule. Did I miss something?`);
      const name = (dfn.getAttribute('data-lt') ?? dfn.textContent).trim();
      res = { name, prose: text.replace(/\s+/g, ' ') };
    }
  }
  else if (dfn.textContent.trim().match(/^[a-zA-Z_][a-zA-Z0-9_\-]+\([^\)]+\)$/)) {
    // Definition is "prod(foo bar)", create a "prod() = prod(foo bar)" entry
    const fn = dfn.textContent.trim().match(/^([a-zA-Z_][a-zA-Z0-9_\-]+)\([^\)]+\)$/)[1];
    res = parseProductionRule(`${fn}() = ${dfn.textContent.trim()}`, { pureSyntax: false });
  }
  else if (parent.nodeName === 'DT') {
    // Definition is in a <dt>, look for value in following <dd>
    let dd = dfn.parentNode;
    while (dd && (dd.nodeName !== 'DD')) {
      dd = dd.nextSibling;
    }
    if (!dd) {
      return;
    }
    let code = dd.querySelector('p > code, pre.prod');
    if (code) {
      if (code.textContent.startsWith(`${text} = `) ||
          code.textContent.startsWith(`<${text}> = `)) {
        res = parseProductionRule(code.textContent, { pureSyntax: true });
      }
      else {
        res = parseProductionRule(`${text} = ${code.textContent}`, { pureSyntax: false });
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

      const name = (dfn.getAttribute('data-lt') ?? dfn.textContent).trim();
      res = { name, prose: dd.textContent.trim().replace(/\s+/g, ' ') };
    }
  }
  else if (parent.nodeName === 'P') {
    // Definition is in regular prose, extract value from prose.
    const name = (dfn.getAttribute('data-lt') ?? dfn.textContent).trim();
    res = { name, prose: parent.textContent.trim().replace(/\s+/g, ' ') };
  }
  else {
    // Definition is in a heading or a more complex structure, just list the
    // name for now.
    const name = (dfn.getAttribute('data-lt') ?? dfn.textContent).trim();
    res = { name };
  }

  res.type = dfnType;
  if (dfnType === 'value') {
    res.value = normalize(res.name);
  }
  if (dfnFor) {
    res.for = dfnFor;
  }

  return res;
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
  [...root.querySelectorAll('pre.prod:not(:has(del)):not(:has(ins))')]
    .concat([...root.querySelectorAll('pre:not(.idl):not(:has(.idl)):not(:has(del)):not(:has(ins))')]
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
      if (text.match(/\s?=\s/)) {
        parseProductionRule(text, { res: rules, pureSyntax: true });
      }
      else if (text.startsWith('@')) {
        const name = text.split(' ')[0];
        parseProductionRule(`${name} = ${text}`, { res: rules, pureSyntax: true });
      }
    });

  return rules;
}
