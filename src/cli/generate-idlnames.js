#!/usr/bin/env node
/**
 * The IDL names generator takes a crawl report as input and creates a report
 * per referenceable IDL name, that details the complete parsed IDL structure
 * that defines the name across all specs.
 *
 * The spec checker can be called directly through:
 *
 * `node generate-idlnames.js [crawl report] [dfns] [save folder]`
 *
 * where `crawl report` is the path to the folder that contains the
 * `index.json` file and all other crawl results produced by crawl-specs.js,
 * `dfns` a param to set to "true" or "dfns" to embed dfns in the generated
 * report, and `save folder` is an optional folder (which must exist) where IDL
 * name extracts are to be saved. In the absence of this parameter, the report
 * is written to the console.
 *
 * When a folder is provided, the IDL name extracts are saved as a JSON
 * structure in an "idlnamesparsed" subfolder, and as IDL fragments in an
 * "idlnames" folder.
 *
 * @module checker
 */

const fs = require('fs');
const path = require('path');
const { requireFromWorkingDirectory, expandCrawlResult } = require('../lib/util');
const { matchIdlDfn, getExpectedDfnFromIdlDesc } = require('./check-missing-dfns');


/**
 * Retrieve the list of definitions that are needed to link members of the
 * the given IDL node
 *
 * @function
 * @param {Object} desc The node that describes an IDL fragment (without the
 *   parsed IDL node structure)
 * @param {Object} idlNode The parsed IDL node that describes the IDL fragment
 * @param {Array} results The list of spec crawl results
 * @return {Object} A list of related definitions indexed by URL of the spec
 *   that defines them.
 */
function getRelatedDfns(desc, idlNode, results) {
  const dfns = [];
  const spec = results.find(s => s.url === desc.spec.url);
  if (!spec || !spec.dfns) {
    return {};
  }

  const parentIdl = idlNode;
  const idlToLinkify = [idlNode];

  switch (idlNode.type) {
    case 'enum':
      if (idlNode.values) {
        idlToLinkify.push(...idlNode.values);
      }
      break;

    case 'callback':
    case 'callback interface':
    case 'dictionary':
    case 'interface':
    case 'interface mixin':
    case 'namespace':
      if (idlNode.members) {
        idlToLinkify.push(...idlNode.members);
      }
      break;
  }

  // Complete IDL to linkify with a link to the definition in the spec, if found
  idlToLinkify.forEach(idl => {
    const expected = getExpectedDfnFromIdlDesc(idl, parentIdl);
    if (expected) {
      const dfn = spec.dfns.find(dfn => matchIdlDfn(expected, dfn));
      if (dfn) {
        dfns.push(dfn);
      }
      else {
        // console.warn('[warn] IDL Names - Missing dfn', JSON.stringify(expected));
      }
    }
  });

  return { spec, dfns };
}


/**
 * Generate a report per referenceable IDL name from the given crawl results.
 *
 * @function
 * @public
 * @param {Array} results The list of spec crawl results to process
 * @param {Object} options Generation options. Set "dfns" to true to embed
 *   definitions in the final export.
 * @return {Object} A list indexed by referenceable IDL name that details, for
 *   each of them, the parsed IDL that defines the name throughout the specs,
 *   along with links to the actual definition of the terms in the specs
 *   (when known).
 */
function generateIdlNames(results, options = {}) {
  function specInfo(spec) {
    return {
      spec: {
        title: spec.title,
        url: spec.url
      }
    };
  }

  const fragments = {};
  const names = {};

  // Add main definitions of all IDL names
  results.forEach(spec => {
    if (!spec.idl || !spec.idl.idlNames) {
      return;
    }
    Object.entries(spec.idl.idlNames).forEach(([name, idl]) => {
      const desc = Object.assign(specInfo(spec), { fragment: idl.fragment });
      fragments[idl.fragment] = idl;

      if (names[name]) {
        // That should never happen, yet it does:
        // IDL names are sometimes defined in multiple specs. Let's consider
        // that the "first" (in order of apparence in the report) apparence is
        // the main one, and let's ignore the second definition.
        console.warn('[warn] IDL Names - Name defined more than once', name);
        return;
      }
      names[name] = {
        name: name,
        defined: desc,
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
        const desc = Object.assign(specInfo(spec), { fragment: idl.fragment });
        fragments[idl.fragment] = idl;

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
        names[name].extended.push(desc);
      }));
  });

  // Expand inheritance and includes info
  Object.values(names).forEach(desc => {
    if (desc.includes) {
      desc.includes = desc.includes.map(name => names[name]).filter(k => !!k);
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

  // Add a link to the definition of each IDL name, when possible
  Object.entries(names).forEach(([name, desc]) => {
    if (!desc.defined) {
      return;
    }
    const spec = results.find(s => s.url === desc.defined.spec.url);
    if (!spec || !spec.dfns) {
      return;
    }
    const idl = fragments[desc.defined.fragment];
    const expected = getExpectedDfnFromIdlDesc(idl);
    if (!expected) {
      return;
    }
    const dfn = spec.dfns.find(dfn => matchIdlDfn(expected, dfn));
    if (!dfn) {
      return;
    }
    desc.defined.href = dfn.href;
  });

  // Serialize structures
  Object.entries(names).forEach(([name, desc]) => {
    names[name] = JSON.parse(JSON.stringify(desc));
  });

  // If requested, add, for each IDL name, the list of definitions for the
  // interfaces and members that the name defines, extends, inherits, or
  // includes.
  if (options.dfns) {
    const dfns = {};
    Object.entries(names).forEach(([name, desc]) => {
      dfns[name] = {};
      if (desc.defined) {
        const idl = fragments[desc.defined.fragment];
        const descDfns = getRelatedDfns(desc.defined, idl, results);
        const url = descDfns.spec ? descDfns.spec.url : null;
        if (url) {
          if (!dfns[name][url]) {
            dfns[name][url] = new Set();
          }
          descDfns.dfns.forEach(dfn => dfns[name][url].add(dfn));
        }
      }
      if (desc.extended) {
        desc.extended.forEach(ext => {
          const idl = fragments[ext.fragment];
          const extDfns = getRelatedDfns(ext, idl, results);
          const url = extDfns.spec ? extDfns.spec.url : null;
          if (url) {
            if (!dfns[name][url]) {
              dfns[name][url] = new Set();
            }
            extDfns.dfns.forEach(dfn => dfns[name][url].add(dfn));
          }
        });
      }
    });

    // Add definitions at the root level and recursively extend the list
    // with the definitions related to the IDL names that the current IDL name
    // inherits from or includes.
    function addDfns(rootName, name) {
      name = name || rootName;
      if (!names[rootName].dfns) {
        names[rootName].dfns = {};
      }
      Object.entries(dfns[name]).forEach(([url, list]) => {
        if (!names[rootName].dfns[url]) {
          names[rootName].dfns[url] = new Set();
        }
        list.forEach(dfn => names[rootName].dfns[url].add(dfn));
      });
      const desc = names[name];
      if (desc.includes) {
        desc.includes.forEach(incl => addDfns(rootName, incl.name));
      }
      if (desc.inheritance) {
        addDfns(rootName, desc.inheritance.name);
      }
    }
    Object.keys(names).forEach(name => {
      addDfns(name);

      // Convert sets to arrays
      Object.entries(names[name].dfns).forEach(([url, list]) => {
        names[name].dfns[url] = Array.from(list);
      });
    });
  }

  return names;
}


async function generateIdlNamesFromPath(crawlPath, options = {}) {
  const crawlIndex = requireFromWorkingDirectory(path.resolve(crawlPath, 'index.json'));
  const crawlResults = await expandCrawlResult(crawlIndex, crawlPath);
  return generateIdlNames(crawlResults.results, options);
}


async function createFolderIfNeeded(name) {
  try {
    await fs.promises.mkdir(name);
  }
  catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
}


/**
 * Save IDL names to individual JSON files in the given folder
 *
 * @function
 * @public
 * @param {Object} names Report generated by generateIdlNames
 * @param {String} folder Path to folder
 */
async function saveParsedIdlNames(names, folder) {
  await createFolderIfNeeded(folder);
  await Promise.all(Object.entries(names).map(([name, idl]) => {
    const json = JSON.stringify(idl, null, 2);
    const filename = path.join(folder, name + '.json');
    return fs.promises.writeFile(filename, json);
  }));
}



/**
 * Save IDL fragments to individual text files in the given folder
 *
 * @function
 * @public
 * @param {Object} names Report generated by generateIdlNames
 * @param {String} folder Path to folder
 */
async function saveIdlNames(names, folder) {
  function serializeNode(node) {
    return `// Source: ${node.spec.title} (${node.spec.url})\n` +
      node.fragment;
  }

  await createFolderIfNeeded(folder);
  await Promise.all(Object.values(names).map(idl => {
    const res = [];
    if (idl.defined) {
      res.push(serializeNode(idl.defined));
    }
    if (idl.extended) {
      idl.extended.map(node => res.push(serializeNode(node)));
    }
    const filename = path.join(folder, idl.name + '.idl');
    return fs.promises.writeFile(filename, res.join('\n\n'));
  }));
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.generateIdlNames = generateIdlNames;
module.exports.saveParsedIdlNames = saveParsedIdlNames;
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

  const dfns = process.argv[3] === 'dfns' || process.argv[3] === 'true';
  const savePath = process.argv[4];
  generateIdlNamesFromPath(crawlPath, { dfns })
    .then(report => {
      if (savePath) {
        saveParsedIdlNames(report, path.join(savePath, 'idlnamesparsed'));
        saveIdlNames(report, path.join(savePath, 'idlnames'));
      }
      else {
        console.log(JSON.stringify(report, null, 2));
      }
    });
}