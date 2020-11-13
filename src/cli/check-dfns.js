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

/**
 * List of spec shortnames that, so far, don't follow the dfns data model
 */
const specsWithOutdatedDfnsModel = [
  'svg-animations', 'svg-markers', 'svg-strokes', 'SVG2',
  'webgl1', 'webgl2',
  'webrtc-identity'
];


/**
 * Return true when provided arrays are "equal", meaning that they contain the
 * same items
 *
 * @function
 * @private
 * @param {Array} a First array to compare
 * @param {Array} b Second array to compare
 * @return {boolean} True when arrays are equal
 */
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
 * Return true if the given parsed IDL object describes a default toJSON
 * operation that references:
 * https://heycam.github.io/webidl/#default-tojson-steps
 *
 * @function
 * @private
 * @param {Object} desc Parsed IDL object to check
 * @return {Boolean} true when object describes a default toJSON operation.
 */
function isDefaultToJSONOperation(desc) {
  return (desc.type === 'operation') &&
    (desc.name === 'toJSON') &&
    (desc.extAttrs && desc.extAttrs.find(attr => attr.name === "Default"));
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
      // Ignore constructors for HTML elements, the spec has a dedicated
      // section for them:
      // https://html.spec.whatwg.org/multipage/dom.html#html-element-constructors
      if (!parentDesc.name.startsWith('HTML')) {
        addExpected({
          linkingText: [`constructor(${serializeArgs(desc.arguments)})`],
          type: desc.type,
          'for': [parentDesc.name]
        })
      }
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
      // Ignore "getter", "setter", "deleter" and "stringifier", that may be
      // defined in the spec, but with arbitrary labels (e.g. "stringification
      // behavior" in DOM) that are hard to map automatically.
      if ((desc.special !== 'stringifier') &&
          (desc.special !== 'getter') &&
          (desc.special !== 'setter') &&
          (desc.special !== 'deleter') &&
          !isDefaultToJSONOperation(desc)) {
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
 * Return true when the given IDL definition matches the expected definition.
 *
 * The function handles overloaded methods, though not properly. That is, it
 * will only find the "right" definition for an overloaded method if the number
 * and/or the name of the arguments differ between the overloaded definitions.
 * Otherwise it will just match the first definition that looks good.
 *
 * The function works around Respec's issue #3200 for methods and constructors
 * that take only optional parameters:
 * https://github.com/w3c/respec/issues/3200
 *
 * @function
 * @private
 * @param {Object} expected Expected definition
 * @param {Object} actual Actual definition to check
 * @param {Object} options Comparison options
 * @return {Boolean} true when actual definition matches the expected one
 */
function matchIdlDfn(expected, actual,
    {skipArgs, skipFor, skipType} = {skipArgs: false, skipFor: false, skipType: false}) {
  const fixedLt = actual.linkingText
    .map(lt => lt.replace(/!overload-\d/, ''))
    .map(lt => lt.replace(/\(, /, '('));
  let found = expected.linkingText.some(val => fixedLt.includes(val));
  if (!found && skipArgs) {
    const names = fixedLt.map(lt => lt.replace(/\(.*\)/, ''));
    found = expected.linkingText.some(val => {
      const valname = val.replace(/\(.*\)/, '');
      return names.find(name => name === valname);
    });
  }
  return found &&
    (expected.for.every(val => actual.for.includes(val)) || skipFor) &&
    (expected.type === actual.type || skipType);
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
        // Right definition is missing, there may be a definition that looks
        // like the one we're looking for
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
        // Right definition is missing, there may be a definition that looks
        // like the one we're looking for
        let found = dfns.find(dfn => matchIdlDfn(expected, dfn, { skipArgs: true }));
        if (found) {
          return { expected, found, warning: true };
        }
        else {
          found = dfns.find(dfn => matchIdlDfn(expected, dfn,
            { skipArgs: true, skipFor: true, skipType: true }));
          return { expected, found };
        }
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


/**
 * Report missing dfn to the console as Markdown
 *
 * @function
 * @private
 * @param {Object} missing Object that desribes missing dfn
 */
function reportMissing(missing) {
  const exp = missing.expected;
  const found = missing.found;
  const foundFor = (found && found.for && found.for.length > 0) ?
    ' for ' + found.for.map(f => `\`${f}\``).join(',') :
    '';
  console.log(`- \`${exp.linkingText[0]}\` ${exp.type ? `with type \`${exp.type}\`` : ''}` +
    ((exp.for && exp.for.length) ? ` for \`${exp.for[0]}\`` : '') +
    (found ? `, but found [\`${found.linkingText[0]}\`](${found.href}) with type \`${found.type}\`${foundFor}` : ''));
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
    if (spec === 'all') {
      res = res
        .filter(result => !specsWithOutdatedDfnsModel.includes(result.shortname))
        .filter(result => result.missing &&
          ((result.missing.css.length > 0) || (result.missing.idl.length > 0)));
    }
    else {
      res = res.filter(result => result.shortname === spec);
    }

    if (format === 'json') {
      console.log(JSON.stringify(res, null, 2));
    }
    else {
      res.forEach(result => {
        const missing = result.missing || {css: [], idl: []};
        const errors = ['css', 'idl']
          .map(type => result.missing[type].filter(missing => !missing.warning))
          .flat();
        const warnings = ['css', 'idl']
          .map(type => result.missing[type].filter(missing => missing.warning))
          .flat();
        console.log('<details>');
        console.log(`<summary><b><a href="${result.crawled}">${result.shortname}</a></b> (${errors.length} errors, ${warnings.length} warnings)</summary>`);
        console.log();
        if (errors.length === 0 && warnings.length === 0) {
          console.log('All good!');
        }
        if (errors.length > 0) {
          console.log('<details open>');
          console.log(`<summary><i>Errors</i> (${errors.length})</summary>`);
          console.log();
          errors.forEach(reportMissing);
          console.log('</details>');
        }
        if (warnings.length > 0) {
          console.log('<details open>');
          console.log(`<summary><i>Warnings</i> (${warnings.length})</summary>`);
          console.log();
          warnings.forEach(reportMissing);
          console.log('</details>');
        }
        console.log('</details>');
        console.log();
      })
    }
}