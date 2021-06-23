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
 */
const extractValueSpaces = doc => {
  let res = {};

  const parseProductionRules = rules =>
    rules
      .map(val => val.split(/\n(?=[^\n]*\s?=\s)/m))
      .reduce((acc, val) => acc.concat(val), [])
      .map(line => line.split(/\s?=\s/).map(s => s.trim().replace(/\s+/g, ' ')))
      .filter(val => val[0].match(/^<.*>$|^.*\(\)$/))
      .filter(val => !!val[1])
      .forEach(val => {
        const name = val[0].replace(/^(.*\(\))$/, '<$1>')
        if (!(name in res)) {
          res[name] = { value: val[1] };
        }
      });

  // Extract non-terminal value spaces defined in `pre` tags
  // (remove note references as in:
  // https://drafts.csswg.org/css-syntax-3/#the-anb-type)
  parseProductionRules([...doc.querySelectorAll('pre.prod')]
    .filter(el => !el.closest(informativeSelector))
    .map(el => {
      [...el.querySelectorAll('sup')]
        .map(sup => sup.parentNode.removeChild(sup));
      return el;
    })
    .map(el => el.textContent));

  // Complete with non-terminal value spaces defined in `pre` tags without
  // an explicit class, as in:
  // https://drafts.fxtf.org/compositing-1/#ltblendmodegt
  parseProductionRules([...doc.querySelectorAll('pre:not(.idl)')]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => el.querySelector('dfn'))
    .map(el => el.textContent));

  // Complete with non-terminal value spaces defined in `dt` tags, as in:
  // https://drafts.csswg.org/css-shapes-1/#funcdef-inset
  // https://drafts.csswg.org/css-transforms/#funcdef-transform-matrix
  parseProductionRules([...doc.querySelectorAll('dt > dfn.css, dt > span.prod > dfn.css')]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => el.parentNode.textContent.match(/\s?=\s/))
    .map(el => el.parentNode.textContent));

  // Complete with function values defined in `dt` tags where definition and
  // value are mixed together, as in:
  // https://drafts.csswg.org/css-overflow-4/#funcdef-text-overflow-fade
  parseProductionRules([...doc.querySelectorAll('dt > dfn.css')]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => el.parentNode.textContent.trim().match(/^[a-zA-Z_][a-zA-Z0-9_\-]+\([^\)]*\)$/))
    .map(el => {
      let fn = el.parentNode.textContent.trim()
        .match(/^([a-zA-Z_][a-zA-Z0-9_\-]+)\([^\)]*\)$/)[1];
      return fn + '() = ' + el.parentNode.textContent;
    }));


  // Complete with non-terminal value spaces defined in `.definition`
  // paragraphs, as in:
  // https://svgwg.org/svg2-draft/painting.html#DataTypeDasharray
  parseProductionRules([...doc.querySelectorAll('.definition > dfn')]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => el.parentNode.textContent.match(/\s?=\s/))
    .map(el => el.parentNode.textContent));

  // Complete with non-terminal value spaces defined in simple paragraphs,
  // as in:
  // https://drafts.csswg.org/css-animations-2/#typedef-single-animation-composition
  // https://drafts.csswg.org/css-transitions/#single-transition-property
  parseProductionRules([...doc.querySelectorAll('p > dfn, div.prod > dfn')]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => el.parentNode.textContent.trim().match(/^<.*>\s?=\s/))
    .map(el => el.parentNode.textContent));

  // Complete with non-terminal value spaces defined in `dt` tags with
  // production rules (or prose) in `dd` tags, as in:
  // https://drafts.csswg.org/css-fonts/#absolute-size-value
  // https://drafts.csswg.org/css-content/#typedef-content-content-list
  [...doc.querySelectorAll('dt > dfn, dt > var')]
    .filter(el => !el.closest(informativeSelector))
    .filter(el => el.textContent.trim().match(/^<.*>$/))
    .filter(el => {
      let link = el.querySelector('a[href]');
      if (!link) {
        return true;
      }
      let href = (link ? link.getAttribute('href') : null);
      return (href === '#' + el.getAttribute('id'));
    })
    .map(el => {
      let dd = el.parentNode;
      while (dd && (dd.nodeName !== 'DD')) {
        dd = dd.nextSibling;
      }
      if (!dd) {
        return null;
      }
      let code = dd.querySelector('p > code, pre.prod');
      if (code) {
        return {
          name: el.textContent.trim(),
          value: code.textContent.trim().replace(/\s+/g, ' ')
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
        return {
          name: el.textContent.trim(),
          prose: dd.textContent.trim().replace(/\s+/g, ' ')
        };
      }
    })
    .filter(space => !!space)
    .forEach(space => {
      if (!(space.name in res)) {
        res[space.name] = {};
      }

      if (!res[space.name].prose && space.prose) {
        res[space.name].prose = space.prose;
      }
      if (!res[space.name].value && space.value) {
        res[space.name].value = space.value;
      }
    });

  return res;
}
