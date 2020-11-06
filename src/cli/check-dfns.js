#!/usr/bin/env node
/**
 * The definitions checker compares CSS, dfns, and IDL extracts created by Reffy
 * to detect CSS/IDL terms that do not have a corresponding dfn in the
 * specification.
 *
 * The definitions checker can be called directly through:
 *
 * `node check-dfns.js [crawl report] [spec] [format]`
 *
 * where:
 * - `crawl report` is the local path to the root folder that contains the
 * `index.json` and the extracts (e.g. `reports/ed`)
 * - `spec` is the optional shortname of the specification on which to focus or
 * `all` (default) to check all specs
 * - `format` is the optional output format. Either `json` or `markdown` with
 * `markdown` being the default.
 *
 * @module checker
 */

const path = require('path');

function arraysEqual(a, b) {
  return Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index]);
}


/**
 * Return the list of expected definitions from the CSS extract
 *
 * @function
 * @private
 * @param {Object} css The root of the object that describes CSS terms in the
 *   CSS extract
 * @return {Array} An array of expected definitions
 */
function getExpectedDfnsFromCSS(css) {
  let expected = [];

  // Add the list of expected properties, filtering out properties that define
  // new values to an existing property (defined elsewhere)
  expected = expected.concat(
    Object.values(css.properties || {})
      .filter(desc => !desc.newValues)
      .map(desc => {
        return {
          linkingText: [desc.name],
          type: 'property',
          'for': []
        };
      })
  );

  // Add the list of expected descriptors
  expected = expected.concat(
    Object.values(css.descriptors || {}).map(desc => {
      return {
        linkingText: [desc.name],
        type: 'descriptor',
        'for': [desc.for]
      };
    })
  );
  
  // Add the list of expected "values".
  // Note: we don't qualify the "type" of values in valuespaces and don't store
  // the scope of values either (the "for" property). Definition types can be
  // "type", "function", "value", etc. in practice. The comparison cannot be
  // perfect as a result.
  expected = expected.concat(
    Object.entries(css.valuespaces || {}).map(([name, desc]) => {
      return {
        linkingText: [name],
        value: desc.value
      };
    })
  );

  return expected;
}


/**
 * Return true when the given CSS definition matches the expected definition
 *
 * @function
 * @private
 * @param {Object} expected Expected definition
 * @param {Object} actual Actual definition to check
 * @return {Boolean} true when actual definition matches the expected one
 */
function matchCSSDfn(expected, actual) {
  return arraysEqual(expected.linkingText, actual.linkingText) &&
    (!expected.for || arraysEqual(expected.for, actual.for)) &&
    (!expected.type || (expected.type === actual.type));
}


/**
 * Return the list of expected definitions from the IDL extract
 *
 * @function
 * @private
 * @param {Object} css The root of the object that describes IDL terms in the
 *   `idlparsed` extract.
 * @return {Array} An array of expected definitions
 */
function getExpectedDfnsFromIdl(idl = {}) {
  const idlNames = Object.values(idl.idlNames || {});
  return idlNames.map(getExpectedDfnsFromIdlDesc).flat();
}


/**
 * Return the list of expected definitions from a parsed IDL extract entry.
 *
 * The function is recursive.
 *
 * @function
 * @private
 * @param {Object} desc The object that describes the IDL term in the
 *   `idlparsed` extract.
 * @param {Object} parentDesc (optional) The object that describes the parent
 *   IDL term of the term to parse (used to compute the `for` property).
 * @return {Array} An array of expected definitions
 */
function getExpectedDfnsFromIdlDesc(desc = {}, parentDesc = {}) {
  let res = [];
  function addExpected(expected) {
    if (expected) {
      expected.access = 'public';
      expected.informative = false;
      res.push(expected);
    }
  }

  function serializeArgs(args = []) {
    return args
      .map(arg => arg.variadic ? `...${arg.name}` : arg.name)
      .join(', ');
  }

  switch (desc.type) {
    case 'attribute':
    case 'const':
      addExpected({
        linkingText: [desc.name],
        type: desc.type,
        'for': [parentDesc.name]
      });
      break;

    case 'constructor':
      addExpected({
        linkingText: [`constructor(${serializeArgs(desc.arguments)})`],
        type: desc.type,
        'for': [parentDesc.name]
      })
      break;

    case 'enum':
      addExpected({
        linkingText: [desc.name],
        type: desc.type,
        'for': []
      });
      (desc.values || [])
        .map(value => getExpectedDfnsFromIdlDesc(value, desc))
        .flat()
        .forEach(addExpected);
      break;

    case 'enum-value':
      // The enumeration could include the empty string as a value. There
      // cannot be a matching definition in that case.
      // Note: look for the quoted value and the unquoted value
      const value = desc.value.replace(/^"(.*)"$/, '$1');
      const values = (value !== '') ? [`"${value}"`, value] : [`"${value}"`];
      addExpected({
        linkingText: values,
        type: desc.type,
        'for': [parentDesc.name]
      });      
      break;

    case 'field':
      addExpected({
        linkingText: [desc.name],
        type: 'dict-member',
        'for': [parentDesc.name]
      });
      break;

    case 'callback':
    case 'callback interface':
    case 'dictionary':
    case 'interface':
    case 'interface mixin':
    case 'namespace':
      const type =
        (desc.type === 'callback interface') ? 'callback' :
        (desc.type === 'interface mixin') ? 'interface' :
        desc.type;
      // Ignore partial definition
      if (!desc.partial) {
        addExpected({
          linkingText: [desc.name],
          type,
          'for': []
        });
      }
      (desc.members || [])
        .map(member => getExpectedDfnsFromIdlDesc(member, desc))
        .flat()
        .forEach(addExpected);
      break;

    case 'iterable':
    case 'maplike':
    case 'setlike':
      // No definition expected for iterable, maplike and setlike members
      break;

    case 'operation':
      // TODO: handle overloaded methods (e.g. RTCPeerConnection.addIceCandidate)
      // TODO: assess what to do with special methods "getter" and "setter"
      // The "stringifier" operation needs to be defined in the spec, but the
      // label is up to the spec (e.g. "stringification behavior" in DOM), so
      // hard to map automatically.
      if ((desc.special !== 'stringifier') &&
          (desc.special !== 'getter') &&
          (desc.special !== 'setter')) {
        addExpected({
          linkingText: [`${desc.name}(${serializeArgs(desc.arguments)})`],
          type: 'method',
          'for': [parentDesc.name]
        });
      }
      break;

    case 'typedef':
      addExpected({
        linkingText: [desc.name],
        type: desc.type,
        'for': []
      });
      break;

    default:
      console.warn('unsupported type', desc.type, desc);
      break;
  }

  return res;
}


/**
 * Return true when the given IDL definition matches the expected definition
 *
 * @function
 * @private
 * @param {Object} expected Expected definition
 * @param {Object} actual Actual definition to check
 * @return {Boolean} true when actual definition matches the expected one
 */
function matchIdlDfn(expected, actual) {
  return expected.linkingText.some(val => actual.linkingText.includes(val)) &&
    expected.for.every(val => actual.for.includes(val)) &&
    expected.type === actual.type;
}


/**
 * Checks the CSS and IDL extracts against the dfns extract for all specs in
 * the report.
 *
 * @function
 * @public
 * @param {String} pathToReport Path to the root folder that contains the
 *  `index.json` report file and the extracts subfolders.
 * @return {Array} The list of specifications along with dfn problems that have
 *  been identified. Each entry has `url`, 'crawled`, `shortname` properties to
 *  identify the specification, and a `missing` property that is an object that
 *  may have `css` and `idl` properties which list missing CSS/IDL definitions.
 */
function checkDefinitions(pathToReport) {
  const rootFolder = path.resolve(process.cwd(), pathToReport);
  const index = require(path.resolve(rootFolder, 'index.json')).results;

  const cssSpecs = index.filter(spec => spec.css);
  const idlSpecs = index.filter(spec => spec.idl);

  // Check all dfns against CSS and IDL extracts
  const missing = index.map(spec => {
    const res = {
      url: spec.url,
      crawled: spec.crawled,
      shortname: spec.shortname,
    };
    if (!spec.dfns) {
      return res;
    }

    const dfns = require(path.resolve(rootFolder, spec.dfns)).dfns;
    const css = spec.css ? require(path.resolve(rootFolder, spec.css)) : {};
    const idl = spec.idlparsed ? require(path.resolve(rootFolder, spec.idlparsed)) : {};

    // Make sure that all expected CSS definitions exist in the dfns extract
    const expectedCSSDfns = getExpectedDfnsFromCSS(css);
    const missingCSSDfns = expectedCSSDfns.map(expected => {
      let actual = dfns.find(dfn => matchCSSDfn(expected, dfn));
      if (!actual && !expected.type) {
        // Right definition is missing. For valuespaces that define functions,
        // look for a function definition without the enclosing "<>" instead
        const altText = [expected.linkingText[0].replace(/^<(.*)\(\)>$/, '$1()')];
        actual = dfns.find(dfn => arraysEqual(altText, dfn.linkingText));
      }
      if (!actual && expected.value) {
        // Still missing? For valuespaces that define functions, this may be
        // because there is no definition without parameters, try to find the
        // actual value instead
        actual = dfns.find(dfn => arraysEqual([expected.value], dfn.linkingText));
      }
      if (actual) {
        // Right definition found
        return null;
      }
      else {
        // Right definition is missing, there may be a definition that looks like
        // the one we're looking for
        const found = dfns.find(dfn =>
          arraysEqual(dfn.linkingText, expected.linkingText));
        return { expected, found };
      }
    }).filter(missing => !!missing);

    // Make sure that all expected IDL definitions exist in the dfns extract
    const expectedIdlDfns = getExpectedDfnsFromIdl(idl.idlparsed);
    const missingIdlDfns = expectedIdlDfns.map(expected => {
      let actual = dfns.find(dfn => matchIdlDfn(expected, dfn));
      if (actual) {
        // Right definition found
        return null;
      }
      else {
        // Missing definition
        const found = dfns.find(dfn =>
          expected.linkingText.some(val => dfn.linkingText.includes(val)));
        return { expected, found };
      }
    }).filter(missing => !!missing);

    // Report results
    res.missing = {
      css: missingCSSDfns,
      idl: missingIdlDfns
    };
    return res;
  });

  return missing;
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.checkDefinitions = checkDefinitions;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    const pathToReport = process.argv[2];
    const spec = process.argv[3] || 'all';
    const format = process.argv[4] || 'markdown';

    let res = checkDefinitions(pathToReport);
    if (spec !== 'all') {
      res = res.filter(result => result.shortname === spec);
    }
    else {
      res = res.filter(result => result.missing &&
        ((result.missing.css.length > 0) || (result.missing.idl.length > 0)));
    }

    if (format === 'json') {
      console.log(JSON.stringify(res, null, 2));
    }
    else {
      res.forEach(result => {
        console.log(`## [${result.shortname}](${result.crawled})`);
        console.log();
        if (!result.missing) {
          console.log('All good!');
        }
        ['css', 'idl'].forEach(type => {
          result.missing[type].forEach(missing => {
            const exp = missing.expected;
            const found = missing.found;
            console.log(`- \`${exp.linkingText[0]}\` with type \`${exp.type}\`` +
              ((exp.for && exp.for.length) ? ` for \`${exp.for[0]}\`` : '') +
              (found ? `, but found [\`${found.linkingText[0]}\`](${found.href})` : ''));
          });
        });
        console.log();
      })
    }
}