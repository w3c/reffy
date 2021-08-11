#!/usr/bin/env node
/**
 * The spec crawler takes a list of spec URLs as input, gathers some knowledge
 * about these specs (published versions, URL of the Editor's Draft, etc.),
 * fetches these specs, parses them, extracts relevant information that they
 * contain (such as the WebIDL they define, the list of specifications that they
 * reference, and links to external specs), and produces a crawl report with the
 * results of these investigations.
 *
 * The spec crawler can be called directly through:
 *
 * `node crawl-specs.js [listfile] [crawl folder] [option]`
 *
 * where `listfile` is the name of a JSON file that contains the list of specs
 * to crawl, `crawl folder` is the name of the folder where the crawl report
 * will be created, and `option` is an optional parameter that can be set to
 * `tr` to tell the crawler to crawl the published version of W3C specifications
 * instead of the Editor's Draft.
 *
 * The JSON file that contains the list of specs to crawl must be an array whose
 * individual items are either:
 * 1. a string that gets interpreted as the URL or the shortname of the spec to
 * crawl. The spec must exist in w3c/browser-specs
 * 2. an object that follows the w3c/browser-specs model:
 * https://github.com/w3c/browser-specs#spec-object
 *
 * @module crawler
 */

const commander = require('commander');
const version = require('../../package.json').version;
const fs = require('fs');
const path = require('path');
const specs = require('browser-specs');
const webidlParser = require('./parse-webidl');
const cssDfnParser = require('../lib/css-grammar-parser');
const { generateIdlNames, saveIdlNames } = require('./generate-idlnames');
const {
    completeWithAlternativeUrls,
    fetch,
    expandBrowserModules,
    getGeneratedIDLNamesByCSSProperty,
    isLatestLevelThatPasses,
    processSpecification,
    requireFromWorkingDirectory,
    setupBrowser,
    teardownBrowser
} = require('../lib/util');

/**
 * Flattens an array
 */
const flatten = arr => arr.reduce(
    (acc, val) => acc.concat(Array.isArray(val) ? flatten(val) : val),
    []);


/**
 * Compares specs for ordering by URL
 */
const byURL = (a, b) => a.url.localeCompare(b.url);


/**
 * Load and parse the given spec.
 *
 * @function
 * @param {Object} spec The spec to load (must already have been completed with
 *   useful info, as returned by "createInitialSpecDescriptions")
 * @param {Object} crawlOptions Crawl options
 * @return {Promise<Object>} The promise to get a spec object with crawl info
 */
async function crawlSpec(spec, crawlOptions) {
    spec.crawled = crawlOptions.publishedVersion ?
        (spec.release ? spec.release : spec.nightly) :
        spec.nightly;

    if (spec.error) {
        return spec;
    }

    try {
        const result = await processSpecification(
            spec.crawled,
            (spec, modules) => {
                const idToHeading = modules.find(m => m.needsIdToHeadingMap) ?
                    window.reffy.mapIdsToHeadings() : null;
                const res = {
                    crawled: window.location.toString()
                };
                modules.forEach(mod => {
                    res[mod.property] = window.reffy[mod.name](spec, idToHeading);
                });
                return res;
            },
            [spec, crawlOptions.modules]
        );

        // Specific rule for IDL extracts:
        // parse the extracted WebIdl content
        if (result.idl !== undefined) {
            try {
                const parsedIdl = await webidlParser.parse(result.idl);
                parsedIdl.hasObsoleteIdl = webidlParser.hasObsoleteIdl(result.idl);
                parsedIdl.idl = result.idl;
                result.idl = parsedIdl;
            }
            catch (err) {
                // IDL content is invalid and cannot be parsed.
                // Let's return the error, along with the raw IDL
                // content so that it may be saved to a file.
                err.idl = result.idl;
                result.idl = err;
            }
        }

        if (result.css) {
            // Specific rule for CSS properties:
            // Add CSS property definitions that weren't in a table
            if (result.dfns) {
                result.dfns
                    .filter(dfn => dfn.type == "property" && !dfn.informative)
                    .forEach(propDfn => {
                        propDfn.linkingText.forEach(lt => {
                            if (!result.css.properties.hasOwnProperty(lt)) {
                                result.css.properties[lt] = {
                                    name: lt
                                };
                            }
                        });
                    });
            }

            // Specific rule for CSS properties:
            // Ideally, the sample definition (property-name) in CSS2 and the custom
            // property definition (--*) in CSS Variables would not be flagged as
            // real CSS properties. In practice, they are. Let's remove them from
            // the extract.
            ['property-name', '--*'].forEach(prop => {
                if ((result.css.properties || {})[prop]) {
                    delete result.css.properties[prop];
                }
            });

            // Specific rule for CSS extracts:
            // Parse extracted CSS definitions and add generated IDL attribute names
            Object.entries(result.css.properties || {}).forEach(([prop, dfn]) => {
                if (dfn.value || dfn.newValues) {
                    try {
                        dfn.parsedValue = cssDfnParser.parsePropDefValue(
                            dfn.value || dfn.newValues);
                    } catch (e) {
                        dfn.valueParseError = e.message;
                    }
                }
                dfn.styleDeclaration = getGeneratedIDLNamesByCSSProperty(prop);
            });
            Object.entries(result.css.descriptors || {}).forEach(([desc, dfn]) => {
                if (dfn.value) {
                    try {
                        dfn.parsedValue = cssDfnParser.parsePropDefValue(
                            dfn.value);
                    } catch (e) {
                        dfn.valueParseError = e.message;
                    }
                }
            });
            Object.entries(result.css.valuespaces || {}).forEach(([vs, dfn]) => {
                if (dfn.value) {
                    try {
                        dfn.parsedValue = cssDfnParser.parsePropDefValue(
                            dfn.value);
                    } catch (e) {
                        dfn.valueParseError = e.message;
                    }
                }
            });
        }

        // Copy results back into initial spec object
        spec.crawled = result.crawled;
        crawlOptions.modules.forEach(mod => {
            if (result[mod.property]) {
                spec[mod.property] = result[mod.property];
            }
        });
    }
    catch (err) {
        spec.title = spec.title || '[Could not be determined, see error]';
        spec.error = err.toString() + (err.stack ? ' ' + err.stack : '');
    }

    return spec;
}


/**
 * Main method that crawls the list of specification URLs and return a structure
 * that full describes its title, URLs, references, and IDL definitions.
 *
 * @function
 * @param {Array(String)} speclist List of URLs to parse
 * @param {Object} crawlOptions Crawl options
 * @return {Promise<Array(Object)} The promise to get an array of complete
 *   specification descriptions
 */
async function crawlList(speclist, crawlOptions) {
    crawlOptions = crawlOptions || {};

    // Prepare Puppeteer instance
    crawlOptions.modules = expandBrowserModules(crawlOptions.modules);
    await setupBrowser(crawlOptions.modules);

    const list = speclist.map(completeWithAlternativeUrls);
    const listAndPromise = list.map(spec => {
        let resolve = null;
        let reject = null;
        let readyToCrawl = new Promise((resolveFunction, rejectFunction) => {
            resolve = resolveFunction;
            reject = rejectFunction;
        });
        return { spec, readyToCrawl, resolve, reject };
    });

    // In debug mode, specs are processed one by one. In normal mode,
    // specs are processing in chunks
    const chunkSize = Math.min((crawlOptions.debug ? 1 : 4), list.length);

    let pos = 0;
    function flagNextSpecAsReadyToCrawl() {
        if (pos < listAndPromise.length) {
            listAndPromise[pos].resolve();
            pos += 1;
        }
    }
    for (let i = 0; i < chunkSize; i++) {
        flagNextSpecAsReadyToCrawl();
    }

    const nbStr = '' + listAndPromise.length;
    async function crawlSpecAndPromise(specAndPromise, idx) {
        await specAndPromise.readyToCrawl;
        const spec = specAndPromise.spec;
        const logCounter = ('' + (idx + 1)).padStart(nbStr.length, ' ') + '/' + nbStr;
        console.log(`${logCounter} - ${spec.url} - crawling`);
        const result = await crawlSpec(spec, crawlOptions);
        console.log(`${logCounter} - ${spec.url} - done`);
        flagNextSpecAsReadyToCrawl();
        return result;
    }

    const results = await Promise.all(listAndPromise.map(crawlSpecAndPromise));

    // Close Puppeteer instance
    teardownBrowser();

    return results;
}


/**
 * Append the resulting data to the given file.
 *
 * Note results are sorted by URL to guarantee that the crawl report produced
 * will always follow the same order.
 *
 * The function also dumps raw CSS/IDL extracts for each spec to the css and
 * idl folders. Note that if the crawl contains multiple levels of a given spec
 * that contain the same type of definitions (css, or idl), the dump is for the
 * latest level.
 *
 * @function
 * @param {Object} crawlOptions Crawl options
 * @param {Array(Object)} data The list of specification structures to save
 * @param {String} folder The path to the report folder
 * @return {Promise<void>} The promise to have saved the data
 */
async function saveResults(crawlOptions, data, folder) {
    async function getSubfolder(name) {
        let subfolder = path.join(folder, name);
        try {
            await fs.promises.mkdir(subfolder);
        }
        catch (err) {
            if (err.code !== 'EEXIST') {
                throw err;
            }
        }
        return subfolder;
    }

    const modules = crawlOptions.modules;
    const folders = {};
    for (const mod of modules) {
        if (mod.metadata) {
            continue;
        }
        folders[mod.property] = await getSubfolder(mod.property);

        // Specific rule for IDL:
        // Also export parsed IDL to separate folder
        // (code will also create "idlnames" and "idlnamesparsed" folders)
        if (mod.property === 'idl') {
            folders.idlparsed = await getSubfolder('idlparsed');
        }
    }

    function getBaseJSON(spec) {
        return {
            spec: {
                title: spec.title,
                url: spec.crawled
            }
        };
    }

    function getSavePropFunction(property, filter) {
        return async function (spec) {
            if (filter(spec)) {
                const contents = getBaseJSON(spec);
                contents[property] = spec[property];
                const json = JSON.stringify(contents, null, 2);
                const filename = path.join(folders[property], spec.shortname + '.json');
                try {
                    await fs.promises.writeFile(filename, json);
                }
                catch (err) {
                    // TODO: report error!
                    console.log(err);
                }
                spec[property] = `${property}/${spec.shortname}.json`;
            }
            else {
                delete spec[property];
            }
        };
    }

    async function saveIdl(spec, filename) {
        let idlHeader = `
            // GENERATED CONTENT - DO NOT EDIT
            // Content was automatically extracted by Reffy into webref
            // (https://github.com/w3c/webref)
            // Source: ${spec.title} (${spec.crawled})`;
        idlHeader = idlHeader.replace(/^\s+/gm, '').trim() + '\n\n';
        let idl = spec.idl.idl
            .replace(/\s+$/gm, '\n')
            .replace(/\t/g, '  ')
            .trim();
        idl = idlHeader + idl + '\n';
        try {
            await fs.promises.writeFile(
                path.join(folders.idl, filename + '.idl'), idl);
        }
        catch (err) {
            console.log(err);
        }
    };

    async function saveCss(spec, filename) {
        // There are no comments in JSON, so include the spec title+URL as the
        // first property instead.
        const css = Object.assign(getBaseJSON(spec), spec.css);
        const json = JSON.stringify(css, (key, val) => {
            if ((key === 'parsedValue') || (key === 'valueParseError')) {
                return undefined;
            }
            else {
                return val;
            }
        }, 2) + '\n';
        const pathname = path.join(folders.css, filename + '.json')
        try {
            await fs.promises.writeFile(pathname, json);
        }
        catch (err) {
            console.log(err);
        }
        spec.css = `css/${filename}.json`;
    };

    // Sort results by URL
    data.sort(byURL);

    // Specific rules for IDL:
    // - Prepare and save IDL names exports
    // - Save IDL extracts for the latest level of a spec
    const idlNames = generateIdlNames(data);
    await saveIdlNames(idlNames, folder);

    // Save IDL dumps for the latest level of a spec to the idl folder
    // TODO: the raw IDL of previous levels in a series is not saved anywhere.
    // That may not be a big deal though as people should only be interested in
    // the latest level for IDL dumps.
    function defineIDLContent(spec) {
        return spec.idl && spec.idl.idl;
    }
    const specsWithIDL = data.filter(defineIDLContent);
    await Promise.all(data
        .filter(spec => (spec.seriesComposition !== 'delta') && isLatestLevelThatPasses(spec, data, defineIDLContent))
        .map(spec => saveIdl(spec, spec.series.shortname)));

    // Save IDL dumps of delta specs too
    // (using the actual shortname of the spec)
    await Promise.all(data
        .filter(spec => (spec.seriesComposition === 'delta') && defineIDLContent(spec))
        .map(spec => saveIdl(spec, spec.shortname)));

    // Move parsed IDL to right property, and replace raw IDL with link to
    // generated IDL extract
    data.map(spec => {
        if (specsWithIDL.includes(spec)) {
            delete spec.idl.idl;
            spec.idlparsed = spec.idl;
            if (spec.seriesComposition === 'delta') {
                spec.idl = `idl/${spec.shortname}.idl`;
            }
            else {
                spec.idl = `idl/${spec.series.shortname}.idl`;
            }
        }
        else if (spec.idl) {
            delete spec.idl;
        }
    });

    // Save CSS dumps for the latest level of a spec to the css folder
    // TODO: crawl.json contained the CSS dumps for earlier levels in a series,
    // but index.json does not since it only links to generated files and we
    // don't generate CSS dumps for specs that are not the latest level. Save
    // them somewhere?
    function defineCSSContent(spec) {
        return spec.css && (
            (Object.keys(spec.css.properties || {}).length > 0) ||
            (Object.keys(spec.css.descriptors || {}).length > 0) ||
            (Object.keys(spec.css.valuespaces || {}).length > 0));
    }
    await Promise.all(data
        .filter(spec => (spec.seriesComposition !== 'delta') && isLatestLevelThatPasses(spec, data, defineCSSContent))
        .map(spec => saveCss(spec, spec.series.shortname)));

    // Save CSS dumps of delta specs too
    // (using the actual shortname of the spec)
    await Promise.all(data
        .filter(spec => (spec.seriesComposition === 'delta') && defineCSSContent(spec))
        .map(spec => saveCss(spec, spec.shortname)));

    // Specs that define CSS now have a "css" key that point to the CSS extract.
    // Specs that don't define CSS still have a "css" key that points to an
    // empty object structure. Let's get rid of it.
    data.filter(spec => spec.css && typeof spec.css !== 'string')
        .map(spec => delete spec.css);

    // Quick and dirty function to determine whether a variable is "empty"
    // (it returns true for falsy values, which is good enough for what we need)
    function isEmpty(thing) {
        return !thing ||
            Array.isArray(thing) && (thing.length === 0) ||
            (typeof thing == 'object') && (Object.keys(thing).length === 0);
    }

    // Save all other extracts
    const remainingModules = modules.filter(mod =>
        !mod.metadata && mod.property !== 'css' && mod.property !== 'idl');
    for (const mod of remainingModules) {
        await Promise.all(data.map(getSavePropFunction(mod.property,
            spec => !isEmpty(spec[mod.property]))));
    }

    // Save parsed IDL structures (without the raw IDL)
    await Promise.all(data.map(getSavePropFunction('idlparsed',
        spec => spec.idlparsed)));

    // Save all results to the index.json file
    let indexFilename = path.join(folder, 'index.json');
    await new Promise((resolve, reject) =>
        fs.readFile(indexFilename, function (err, content) {
            if (err) return reject(err);

            let filedata = {};
            try {
                filedata = JSON.parse(content);
            } catch (e) {}

            filedata.type = filedata.type || 'crawl';
            filedata.title = 'Reffy crawl';
            filedata.date = filedata.date || (new Date()).toJSON();
            filedata.options = crawlOptions;
            filedata.options.modules = filedata.options.modules.map(mod => mod.property);
            filedata.stats = {};
            filedata.results = (filedata.results || []).concat(data);
            filedata.results.sort(byURL);
            filedata.stats = {
                crawled: filedata.results.length,
                errors: filedata.results.filter(spec => !!spec.error).length
            };

            fs.writeFile(indexFilename, JSON.stringify(filedata, null, 2),
                         err => { if (err) return reject(err); return resolve();});
        })
    );
}


/**
 * Crawls the specifications listed in the given JSON file and generates a
 * crawl report in the given folder.
 *
 * @function
 * @param {String} resultsPath Folder that is to contain the crawl report
 * @param {Object} options Crawl options
 * @return {Promise<void>} The promise that the crawl will have been made
 */
function crawlSpecs(resultsPath, options) {
    if (!resultsPath) {
        return Promise.reject('Required folder parameter missing');
    }
    try {
        fs.writeFileSync(path.join(resultsPath, 'index.json'), '');
    } catch (err) {
        return Promise.reject('Impossible to write to ' + resultsPath + ': ' + err);
    }

    function prepareListOfSpecs(list) {
        return list.map(spec => (typeof spec !== 'string') ? spec :
            specs.find(s => s.url === spec || s.shortname === spec) ??
            { url: spec, nightly: spec, shortname: spec.replace(/[:\/\.]/g, '') });
    }

    const requestedList = (options && options.specFile) ?
        prepareListOfSpecs(requireFromWorkingDirectory(options.specFile)) :
        specs;

    return crawlList(requestedList, options)
        .then(results => saveResults(options, results, resultsPath));
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.crawlList = crawlList;
module.exports.crawlSpecs = crawlSpecs;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {

    function parseModuleOption(input) {
        const parts = input.split(':');
        if (parts.length > 2) {
            throw new commander.InvalidArgumentError('Module input cannot have more than one ":" character');
        }
        if (parts.length === 2) {
            return {
                href: parts[1],
                property: parts[0]
            };
        }
        else {
            return parts[0];
        }
    }

    const program = new commander.Command();
    program
        .version(version)
        .usage('<folder> [speclist] [options]')
        .description('Crawls and processes a list of Web specifications and report results to a folder')
        .option('-d, --debug', 'debug mode, crawl one spec at a time')
        .option('-m, --module <modules...>', 'spec processing modules')
        .option('-r, --release', 'crawl release (TR) version of specs')
        .argument('<folder>', 'existing folder where crawl results are to be saved')
        .argument('[speclist]', 'path to JSON file that lists specs to crawl')
        .action((folder, speclist, options) => {
            const crawlOptions = {
                specFile: speclist,
                publishedVersion: options.release,
                debug: options.debug
            };
            if (options.module) {
                crawlOptions.modules = options.module.map(parseModuleOption);
            }
            crawlSpecs(folder, crawlOptions)
                .then(_ => {
                    console.log('Finished');
                    process.exit(0);
                })
                .catch(err => {
                    console.error(err);
                    process.exit(1);
                });
        })
        .showHelpAfterError('(run with --help for usage information)')
        .addHelpText('after', `
Minimal usage example:
  $ node crawl-specs.js reports/test

Usage notes:
- If [speclist] is not specified, the crawler crawls all specs in browser-specs:
  https://github.com/w3c/browser-specs/

- The [speclist] file may contain a mix of spec URLs and spec shortnames. Spec
shortnames must exist in browser-specs.

- If processing modules are not specified, the crawler runs all core processing
modules:
  https://github.com/w3c/reffy/tree/main/src/reffy.json

- Modules must be specified using a relative path to an ".mjs" file that defines
the processing logic to run on the spec's page in a browser context. For
instance:
  $ node crawl-specs.js reports/test --module extract-editors.mjs

- Absolute paths to modules are not properly handled and will likely result in a
crawling error.

- Multiple modules can be specified, repeating the option name or not:
  $ node crawl-specs.js reports/test -m extract-words.mjs extract-editors.mjs
  $ node crawl-specs.js reports/test -m extract-words.mjs -m extract-editors.mjs

- The "-m" or "--module" option cannot appear before <folder>, unless you use
"--" to flag the end of the list:
  $ node crawl-specs.js --module extract-editors.mjs -- reports/test

- Core processing modules may be referenced using the name of the extract they
define:
  $ node crawl-specs.js reports/test --module dfns

- To run all core processing modules, use "core". For instance, to apply a
processing module on top of core processing modules, use:
  $ node crawl-specs.js reports/test --module core extract-editors.mjs

- Each module must export a function that takes a spec object as input and
return a result that can be serialized as JSON. A typical module code looks
like:
  https://github.com/w3c/reffy/blob/main/src/browserlib/extract-ids.mjs

- Individual extracts will be created under "<folder>/[camelCaseModule]" where
"[camelCaseModule]" is derived from the module's filename, for instance:
  "extract-editors.mjs" creates extracts under "<folder>/extractEditors"

- The name of the folder where extracts get created may be specified for custom
modules by prefixing the path to the module with the folder name followed by
":". For instance, to save extracts to "reports/test/editors", use:
  $ node crawl-specs.js reports/test --module editors:extract-editors.mjs
`);

    program.parse(process.argv);
}
