import informativeSelector from './informative-selector.mjs';

/**
 * Extract the list of CSS definitions in the current spec
 *
 * @function
 * @public 
 * @return {Promise} The promise to get an extract of the CSS definitions, or
 *   an empty CSS description object if the spec does not contain any CSS
 *   definition. The return object will have properties named "properties",
 *  "descriptors", and "valuespaces".
 */
export default function () {
  let res = {
    properties: extractTableDfns(document, 'propdef', { unique: true }),
    descriptors: extractTableDfns(document, 'descdef', { unique: false }),
    valuespaces: extractValueSpaces(document)
  };

  // Try old recipes if we couldn't extract anything
  if ((Object.keys(res.properties).length === 0) &&
      (Object.keys(res.descriptors).length === 0)) {
    res.properties = extractDlDfns(document, 'propdef', { unique: true });
    res.descriptors = extractDlDfns(document, 'descdef', { unique: false });
  }

  return res;
}


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
        value: cleanedLine.querySelector('td:last-child').textContent.trim().replace(/\s+/g, ' ')
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
      value: line.querySelector('td:last-child').textContent.trim().replace(/\s+/g, ' ')
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
    merged.value += ` | ${partialDfn.newValues}`;
  }
  else {
    merged.newValues += ` | ${partialDfn.newValues}`;
  }

  return merged;
};


/**
 * Extract CSS definitions in a spec using the given CSS selector and extractor
 */
const extractDfns = (doc, selector, extractor, { unique } = { unique: true }) => {
  let res = {};
  [...doc.querySelectorAll(selector)]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => !el.querySelector('ins, del'))
    .map(extractor)
    .filter(dfn => !!dfn.name)
    .map(dfn => dfn.name.split(',').map(name => Object.assign({},
      dfn, { name: name.trim() })))
    .reduce((acc, val) => acc.concat(val), [])
    .forEach(dfn => {
      if (res[dfn.name]) {
        if (unique) {
          const merged = mergeDfns(res[dfn.name], dfn);
          if (!merged) {
            throw new Error(`More than one dfn found for CSS property "${dfn.name}" and dfns cannot be merged`);
          }
          res[dfn.name] = merged;
        }
        else {
          res[dfn.name].push(dfn);
        }
      }
      else {
        res[dfn.name] = unique ? dfn : [dfn];
      }
    });
  return res;
};


/**
 * Extract CSS definitions in tables for the given class name
 * (typically one of `propdef` or `descdef`)
 */
const extractTableDfns = (doc, className, options) =>
  extractDfns(doc, 'table.' + className + ':not(.attrdef)', extractTableDfn, options);


/**
 * Extract CSS definitions in a dl list for the given class name
 * (typically one of `propdef` or `descdef`)
 */
const extractDlDfns = (doc, className, options) =>
  extractDfns(doc, 'div.' + className + ' dl', extractDlDfn, options);


/**
 * Extract value spaces (non-terminal values) defined in the specification
 *
 * From a definitions data model perspective, non-terminal values are those
 * defined with a `data-dfn-type` attribute equal to `type` or `function`. They
 * form (at least in theory) a single namespace across CSS specs.
 *
 * Definitions with `data-dfn-type` attribute set to `value` are not extracted
 * on purpose as they are typically namespaced to another construct (through a
 * `data-dfn-for` attribute.
 */
const extractValueSpaces = doc => {
  let res = {};

  const parseProductionRule = rule => {
    const nameAndValue = rule
      .replace(/\/\*[^]*?\*\//gm, '')  // Drop comments
      .split(/\s?=\s/)
      .map(s => s.trim().replace(/\s+/g, ' '));
    if (nameAndValue[0].match(/^<.*>$|^.*\(\)$/)) {
      const name = nameAndValue[0].replace(/^(.*\(\))$/, '<$1>');
      if (!(name in res)) {
        res[name] = {};
      }
      if (!res[name].value) {
        res[name].value = nameAndValue[1];
      }
    }
  };

  // Extract all dfns with data-dfn-type="type" or data-dfn-type="function"
  // but ignore definitions in <pre> as they do not always use dfns, as in
  // https://drafts.csswg.org/css-values-4/#calc-syntax
  [...doc.querySelectorAll(
      'dfn[data-dfn-type=type],dfn[data-dfn-type=function]')]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => !el.closest('pre'))
    .forEach(dfn => {
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
        parseProductionRule(text);
      }
      else if (dfn.textContent.trim().match(/^[a-zA-Z_][a-zA-Z0-9_\-]+\([^\)]+\)$/)) {
        // Definition is "prod(foo bar)", create a "prod() = prod(foo bar)" entry
        const fn = dfn.textContent.trim().match(/^([a-zA-Z_][a-zA-Z0-9_\-]+)\([^\)]+\)$/)[1];
        parseProductionRule(`${fn}() = ${dfn.textContent.trim()}`);
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
            parseProductionRule(code.textContent);
          }
          else {
            parseProductionRule(`${text} = ${code.textContent}`);
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

          const name = (dfn.getAttribute('data-lt') ?? dfn.textContent)
            .trim().replace(/^<?(.*?)>?$/, '<$1>');
          if (!(name in res)) {
            res[name] = {};
          }
          if (!res[name].prose) {
            res[name].prose = dd.textContent.trim().replace(/\s+/g, ' ');
          }
        }
      }
      else if (parent.nodeName === 'P') {
        // Definition is in regular prose, extract value from prose.
        const name = (dfn.getAttribute('data-lt') ?? dfn.textContent)
          .trim().replace(/^<?(.*?)>?$/, '<$1>');
        if (!(name in res)) {
          res[name] = {
            prose: parent.textContent.trim().replace(/\s+/g, ' ')
          };
        }
      }
    });

  // Complete with production rules defined in <pre class=prod> tags (some of
  // which use dfns, while others don't, but all of them are actual production
  // rules). For <pre> tags that don't have a "prod" class (e.g. in HTML and
  // css-namespaces), make sure they contain a <dfn> to avoid parsing things
  // that are not production rules
  [...doc.querySelectorAll('pre.prod')]
    .concat([...doc.querySelectorAll('pre:not(.idl)')]
      .filter(el => el.querySelector('dfn')))
    .filter(el => !el.closest(informativeSelector))
    .map(el => el.cloneNode(true))
    .map(el => {
      [...el.querySelectorAll('sup')]
        .map(sup => sup.parentNode.removeChild(sup));
      return el;
    })
    .map(el => el.textContent)
    .map(val => val.replace(/\/\*[^]*?\*\//gm, ''))  // Drop comments
    .map(val => val.split(/\n(?=[^\n]*\s?=\s)/m))    // Separate definitions
    .flat()
    .map(text => parseProductionRule(text));

  return res;
}
