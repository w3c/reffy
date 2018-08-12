#!/usr/bin/env node
/**
 * The CSS definitions extractor takes the URL of a spec as input and outputs
 * a structured JSON-like object that contains the CSS definitions found in the
 * spec.
 *
 * The CSS definitions extractor can be called directly through:
 *
 * `node extract-cssdef.js [url]`
 *
 * where `url` is the URL of the spec to fetch and parse.
 *
 * @module webidlExtractor
 */

const urlOrDom = require('../lib/util').urlOrDom;
const getDocumentAndGenerator = require('../lib/util').getDocumentAndGenerator;


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
 * Extract CSS definitions in a spec using the given CSS selector and extractor
 */
const extractDfns = (doc, selector, extractor) => {
  let res = {};
  [...doc.querySelectorAll(selector)]
    .map(extractor)
    .filter(dfn => !!dfn.name)
    .map(dfn => dfn.name.split(',').map(name => Object.assign({},
      dfn, { name: name.trim() })))
    .reduce((acc, val) => acc.concat(val), [])
    .forEach(dfn => {
      if ((dfn.name === 'property-name') ||
          (dfn.name === '--*')) {
        // Ignore sample definition && custom properties definition
        return;
      }
      res[dfn.name] = dfn;
    });
  return res;
};


/**
 * Extract CSS definitions in tables for the given class name
 * (typically one of `propdef` or `descdef`)
 */
const extractTableDfns = (doc, className) =>
  extractDfns(doc, 'table.' + className + ':not(.attrdef)', extractTableDfn);


/**
 * Extract CSS definitions in a dl list for the given class name
 * (typically one of `propdef` or `descdef`)
 */
const extractDlDfns = (doc, className) =>
  extractDfns(doc, 'div.' + className + ' dl', extractDlDfn);


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
      .forEach(val => res[val[0].replace(/^(.*\(\))$/, '<$1>')] = {
        value: val[1]
      });

  // Extract non-terminal value spaces defined in `pre` tags
  // (remove note references as in:
  // https://drafts.csswg.org/css-syntax-3/#the-anb-type)
  parseProductionRules([...doc.querySelectorAll('pre.prod')]
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
    .filter(el => el.querySelector('dfn'))
    .map(el => el.textContent));

  // Complete with non-terminal value spaces defined in `dt` tags, as in:
  // https://drafts.csswg.org/css-shapes-1/#funcdef-inset
  // https://drafts.csswg.org/css-transforms/#funcdef-transform-matrix
  parseProductionRules([...doc.querySelectorAll('dt > dfn.css, dt > span.prod > dfn.css')]
    .filter(el => el.parentNode.textContent.match(/\s?=\s/))
    .map(el => el.parentNode.textContent));

  // Complete with function values defined in `dt` tags where definition and
  // value are mixed together, as in:
  // https://drafts.csswg.org/css-overflow-4/#funcdef-text-overflow-fade
  parseProductionRules([...doc.querySelectorAll('dt > dfn.css')]
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
    .filter(el => el.parentNode.textContent.match(/\s?=\s/))
    .map(el => el.parentNode.textContent));

  // Complete with non-terminal value spaces defined in simple paragraphs,
  // as in:
  // https://drafts.csswg.org/css-animations-2/#typedef-single-animation-composition
  // https://drafts.csswg.org/css-transitions/#single-transition-property
  parseProductionRules([...doc.querySelectorAll('p > dfn, div.prod > dfn')]
    .filter(el => el.parentNode.textContent.trim().match(/^<.*>\s?=\s/))
    .map(el => el.parentNode.textContent));

  // Complete with non-terminal value spaces defined in `dt` tags with
  // production rules (or prose) in `dd` tags, as in:
  // https://drafts.csswg.org/css-fonts/#absolute-size-value
  // https://drafts.csswg.org/css-content/#typedef-content-content-list
  [...doc.querySelectorAll('dt > dfn, dt > var')]
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
        return {
          name: el.textContent.trim(),
          prose: dd.textContent.trim().replace(/\s+/g, ' ')
        };
      }
    })
    .filter(space => !!space)
    .forEach(space => {
      res[space.name] = {};
      if (space.prose) {
        res[space.name].prose = space.prose;
      }
      if (space.value) {
        res[space.name].value = space.value;
      }
    });

  return res;
}

/**
 * Main method that takes the URL of a specification, loads that spec
 * and extract the list of CSS definitions that it contains
 *
 * @function
 * @public
 * @param {String} url The URL of the specification
 * @return {Promise} The promise to get a dump of the CSS definitions as a JSON
 *   object whose first-level keys are "properties" and "descriptors"
 */
async function extract(url) {
  const window = await urlOrDom(url);
  const { doc, generator } = await getDocumentAndGenerator(window);
  let res = {
    properties: extractTableDfns(doc, 'propdef'),
    descriptors: extractTableDfns(doc, 'descdef'),
    valuespaces: extractValueSpaces(doc)
  };

  // Try old recipes if we couldn't extract anything
  if ((Object.keys(res.properties).length === 0) &&
      (Object.keys(res.descriptors).length === 0)) {
    res.properties = extractDlDfns(doc, 'propdef');
    res.descriptors = extractDlDfns(doc, 'descdef');
  }

  return res;
}


/**************************************************
Export the extract method for use as module
**************************************************/
module.exports.extract = extract;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var url = process.argv[2];
    if (!url) {
        console.error("Required URL parameter missing");
        process.exit(2);
    }
    extract(url)
        .then(css => {
            console.log(JSON.stringify(css, null, 2));
        })
        .catch(err => {
            console.error(err);
            process.exit(64);
        });
}

