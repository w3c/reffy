#!/usr/bin/env node
/**
 * The IDL names generator takes a crawl report as input and creates a report
 * per referenceable IDL name, that details the complete parsed IDL structure
 * that defines the name across all specs.
 *
 * The spec checker can be called directly through:
 *
 * `node generate-idlnames.js [crawl report] [save folder]`
 *
 * where `crawl report` is the path to the folder that contains the
 * `index.json` file and all other crawl results produced by crawl-specs.js,
 * and `save folder` is an optional folder (which must exist) where IDL name
 * extracts are to be saved. In the absence of this parameter, the report is
 * written to the console.
 *
 * @module checker
 */

const fs = require('fs');
const path = require('path');
const { requireFromWorkingDirectory, expandCrawlResult } = require('../lib/util');
const { matchIdlDfn, getExpectedDfnFromIdlDesc } = require('./check-missing-dfns');


function linkifyIdl(idl, results) {
  const spec = results.find(s => s.url === idl.spec.url);
  if (!spec || !spec.dfns) {
    return;
  }

  function traverseIdl(idl, parentIdl) {
    // Complete IDL with a link to the definition in the spec, if found
    const expected = getExpectedDfnFromIdlDesc(idl, parentIdl);
    if (expected) {
      const dfn = spec.dfns.find(dfn => matchIdlDfn(expected, dfn));
      if (dfn) {
        idl.href = dfn.href;
      }
      else {
        // console.warn('[warn] IDL Names - Missing dfn', JSON.stringify(expected));
      }
    }

    switch (idl.type) {
      case 'enum':
        (idl.values || []).forEach(value => traverseIdl(value, idl));
        break;

      case 'callback':
      case 'callback interface':
      case 'dictionary':
      case 'interface':
      case 'interface mixin':
      case 'namespace':
        (idl.members || []).forEach(member => traverseIdl(member, idl));
        break;
    }    
  }

  traverseIdl(idl);
}


/**
 * Generate a report per referenceable IDL name from the given crawl results.
 *
 * @function
 * @public
 * @param {Array} results The list of spec crawl results to process
 * @return {Object} A list indexed by referenceable IDL name that details, for
 *   each of them, the parsed IDL that defines the name throughout the specs,
 *   along with links to the actual definition of the terms in the specs
 *   (when known).
 */
function generateIdlNames(results) {
  function specInfo(spec) {
    return {
      spec: {
        title: spec.title,
        url: spec.url
      }
    };
  }

  const names = {};

  // Add main definitions of all IDL names
  results.forEach(spec => {
    if (!spec.idl || !spec.idl.idlNames) {
      return;
    }
    Object.entries(spec.idl.idlNames).forEach(([name, idl]) => {
      // Make a deep copy of the IDL block since we're going to add "href"
      // properties throughout the structure, and extend it with spec info
      idl = Object.assign(specInfo(spec), JSON.parse(JSON.stringify(idl)));

      if (names[name]) {
        // That should never happen, yet it does:
        // IDL names are sometimes defined in multiple specs. Let's consider
        // that the "first" (in order of apparence in the report) apparence is
        // the main one, and let's ignore the second definition.
        console.warn('[warn] IDL Names - Name defined more than once', name);
        return;
      }
      names[name] = {
        defined: idl,
        extended: [],
        inheritance: idl.inheritance,
        includes: []
      };
    });
  });

  // Add definitions that extend base definitions
  results.forEach(spec => {
    if (!spec.idl || !spec.idl.idlExtendedNames) {
      return;
    }
    Object.entries(spec.idl.idlExtendedNames).forEach(([name, extensions]) =>
      extensions.forEach(idl => {
        // Make a deep copy of the IDL block since we're going to add "href"
        // properties throughout the structure, and extend it with spec info
        idl = Object.assign(specInfo(spec), JSON.parse(JSON.stringify(idl)));

        if (!names[name]) {
          // That should never happen, and it does not in practice unless there
          // was a crawling error on the spec that normally defines the base
          // IDL name. Alas, such crawling errors do happen from time to time.
          console.warn('[warn] IDL Names - No definition found', name);
          names[name] = {
            extended: [],
            includes: []
          };
        }
        if (idl.includes) {
          names[name].includes.push(idl.includes);
        }
        names[name].extended.push(idl);
      }));
  });

  // Look at extracted dfns and complete the parsed IDL structures with links
  // to the definitions of the terms in the spec
  Object.values(names).forEach(desc => {
    if (desc.defined) {
      linkifyIdl(desc.defined, results);
    }
    if (desc.extended) {
      desc.extended.forEach(ext => linkifyIdl(ext, results));
    }
  });

  // Expand inheritance and includes info
  Object.values(names).forEach(desc => {
    if (desc.includes) {
      desc.includes = desc.includes.map(name => names[name]);
    }
    if (desc.inheritance) {
      desc.inheritance = names[desc.inheritance];
    }
  });

  // The expansions were done by reference. In the end, we'll want to serialize
  // the structure, so we need to make sure that there aren't any cycle. Mixins
  // cannot create cycles, but inheritance chains can, if not done properly.
  Object.entries(names).forEach(([name, desc]) => {
    let current = desc;
    while (current) {
      current = current.inheritance;
      if (current && (current.name === name)) {
        console.warn('[warn] IDL Names - Cyclic inheritance chain detected', name);
        current.inheritance = null;
      }
    }
  });

  return names;
}


async function generateIdlNamesFromPath(crawlPath) {
  const crawlIndex = requireFromWorkingDirectory(path.resolve(crawlPath, 'index.json'));
  const crawlResults = await expandCrawlResult(crawlIndex, crawlPath);
  return generateIdlNames(crawlResults.results);
}


/**
 * Save IDL names to individual JSON files in the given folder
 *
 * @function
 * @public
 * @param {Object} names Report generated by generateIdlNames
 * @param {String} folder Path to folder
 */
async function saveIdlNames(names, folder) {
  await Promise.all(Object.entries(names).map(([name, idl]) => {
    const json = JSON.stringify(idl, null, 2);
    const filename = path.join(folder, name + '.json');
    return fs.promises.writeFile(filename, json);
  }));
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.generateIdlNames = generateIdlNames;
module.exports.saveIdlNames = saveIdlNames;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
  const crawlPath = process.argv[2];
  if (!crawlPath) {
    console.error('Required path to crawl results folder is missing');
    process.exit(2);
  }

  const savePath = process.argv[3];
  generateIdlNamesFromPath(crawlPath)
    .then(report => {
      if (savePath) {
        saveIdlNames(report, savePath);
      }
      else {
        console.log(JSON.stringify(report, null, 2));
      }
    });
}