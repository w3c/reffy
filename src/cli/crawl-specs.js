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
 * `node crawl-specs.js [options]`
 *
 * Use `--help` option for usage instructions.
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
    expandCrawlResult,
    getGeneratedIDLNamesByCSSProperty,
    isLatestLevelThatPasses,
    processSpecification,
    requireFromWorkingDirectory,
    setupBrowser,
    teardownBrowser
} = require('../lib/util');


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
    crawlOptions = crawlOptions || {};
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
            [spec, crawlOptions.modules],
            { quiet: crawlOptions.quiet }
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
 * Saves spec results to extract files as needed and replaces the results with
 * links accordingly.
 *
 * @function
 * @param {Object} spec The results of crawling the spec. Object should contain
 *   metadata about the spec and the crawl processing results in appropriate
 *   properties.
 * @param {Object} settings Crawl settings. Recognized settings: "modules",
 *   "output" and "quiet". See CLI help (node crawl-specs.js --help) for
 *   details. The "modules" setting is mandatory and note that the function
 *   will not do anything if "output" is not set.
 * @return {Promise<Object>} The promise to get an updated spec object that
 *   contains links to created extracts.
 */
async function saveSpecResults(spec, settings) {
    settings = settings || {};
    if (!settings.output) {
        return spec;
    }

    async function getSubfolder(name) {
        let subfolder = path.join(settings.output, name);
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

    const modules = settings.modules;
    const folders = {};
    for (const mod of modules) {
        if (mod.metadata) {
            continue;
        }
        folders[mod.property] = await getSubfolder(mod.property);

        // Specific rule for IDL:
        // Raw IDL goes to "idl" subfolder, parsed IDL goes to "idlparsed"
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

    async function saveExtract(spec, property, filter) {
        if (filter(spec)) {
            const contents = getBaseJSON(spec);
            contents[property] = spec[property];
            const json = JSON.stringify(contents, null, 2);
            const filename = path.join(folders[property], spec.shortname + '.json');
            await fs.promises.writeFile(filename, json);
            spec[property] = `${property}/${spec.shortname}.json`;
        }
        else {
            delete spec[property];
        }
    }

    async function saveIdl(spec) {
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
        await fs.promises.writeFile(
            path.join(folders.idl, spec.shortname + '.idl'), idl);
    };

    async function saveCss(spec) {
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
        const pathname = path.join(folders.css, spec.shortname + '.json')
        await fs.promises.writeFile(pathname, json);
        spec.css = `css/${spec.shortname}.json`;
    };

    // Save IDL dumps
    if (spec.idl && spec.idl.idl) {
        await saveIdl(spec);
        delete spec.idl.idl;
        spec.idlparsed = spec.idl;
        spec.idl = `idl/${spec.shortname}.idl`;
        await saveExtract(spec, 'idlparsed', spec => spec.idlparsed);
    }
    else if (spec.idl) {
        delete spec.idl;
    }

    // Save CSS dumps
    function defineCSSContent(spec) {
        return spec.css && (
            (Object.keys(spec.css.properties || {}).length > 0) ||
            (Object.keys(spec.css.descriptors || {}).length > 0) ||
            (Object.keys(spec.css.valuespaces || {}).length > 0));
    }
    if (defineCSSContent(spec)) {
        await saveCss(spec);
    }

    // Specs that define CSS now have a "css" key that point to the CSS extract.
    // Specs that don't define CSS still have a "css" key that points to an
    // empty object structure. Let's get rid of it.
    if (spec.css && typeof spec.css !== 'string') {
        delete spec.css;
    }

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
        await saveExtract(spec, mod.property, spec => !isEmpty(spec[mod.property]));
        if (spec[mod.property] && typeof spec[mod.property] !== 'string') {
            delete spec[mod.property];
        }
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
        crawlOptions.quiet ?? console.warn(`${logCounter} - ${spec.url} - crawling`);
        let result = await crawlSpec(spec, crawlOptions);
        result = await saveSpecResults(result, crawlOptions);
        crawlOptions.quiet ?? console.warn(`${logCounter} - ${spec.url} - done`);
        flagNextSpecAsReadyToCrawl();

        return result;
    }

    const results = await Promise.all(listAndPromise.map(crawlSpecAndPromise));

    // Close Puppeteer instance
    teardownBrowser();

    return results;
}


/**
 * Merges extracts per series for the given property and adjusts links
 *
 * @function
 * @param {Array(object)} data Crawl results
 * @param {string} property The extract property to process
 * @param {Object} settings Crawl settings. The function looks at the "output"
 *   setting to determine where to look for extracts
 * @return {Promise(Array)} The promise to get an updated crawl results array
 */
async function adjustExtractsPerSeries(data, property, settings) {
    if (!settings.output) {
        return data;
    }

    const fullLevels = data.filter(spec =>
        (spec.seriesComposition !== 'delta') &&
        isLatestLevelThatPasses(spec, data, spec => spec[property]));
    const deltaLevels = data.filter(spec =>
        (spec.seriesComposition === 'delta') && spec[property]);

    data.forEach(spec => {
        if (fullLevels.includes(spec)) {
            // Full level, rename the extract after the series' shortname
            const pathname = path.resolve(settings.output, spec[property]);
            spec[property] = `${property}/${spec.series.shortname}${path.extname(spec[property])}`;
            const newpathname = path.resolve(settings.output, spec[property]);
            fs.renameSync(pathname, newpathname);
        }
        else if (deltaLevels.includes(spec)) {
            // Delta level, need to keep the extract as-is
        }
        else if (spec[property]) {
            // Not the right full level in the series, drop created extract
            // and link to the series extract instead
            const pathname = path.resolve(settings.output, spec[property]);
            fs.unlinkSync(pathname);
            spec[property] = `${property}/${spec.series.shortname}${path.extname(spec[property])}`;
        }
    });

    return data;
}


/**
 * Saves the crawl results to an index.json file.
 *
 * @function
 * @param {Array(Object)} data The list of specification structures to save
 * @param {Object} settings Crawl settings. The function does not create any
 *   save file if the "output" setting is not set.
 * @return {Promise<void>} The promise to have saved the data
 */
async function saveResults(data, settings) {
    if (!settings.output) {
        return data;
    }

    // Save all results to an index.json file
    const indexFilename = path.join(settings.output, 'index.json');
    const contents = {
        type: 'crawl',
        title: 'Reffy crawl',
        date: (new Date()).toJSON(),
        options: settings,
        stats: {},
        results: data
    };
    contents.options.modules = contents.options.modules.map(mod => mod.property);
    contents.stats = {
        crawled: contents.results.length,
        errors: contents.results.filter(spec => !!spec.error).length
    };

    await fs.promises.writeFile(indexFilename, JSON.stringify(contents, null, 2));
    return contents;
}


/**
 * Crawls the specifications listed in the given JSON file and generates a
 * crawl report in the given folder.
 *
 * @function
 * @param {Object} options Crawl options. Possible options are:
 *   publishedVersion, debug, output, terse, modules and specs.
 *   See CLI help (node crawl-specs.js --help) for details.
 * @return {Promise<void>} The promise that the crawl will have been made
 */
function crawlSpecs(options) {
    function prepareListOfSpecs(list) {
        return list.map(spec => (typeof spec !== 'string') ? spec :
            specs.find(s => s.url === spec || s.shortname === spec) ??
            { url: spec, nightly: spec, shortname: spec.replace(/[:\/\.]/g, '') });
    }

    const requestedList = (options && options.specs) ?
        prepareListOfSpecs(options.specs) :
        specs;

    return crawlList(requestedList, options)
        .then(async results => {
            // Merge extracts per series when necessary (CSS/IDL extracts)
            for (const mod of options.modules) {
                if (mod.extractsPerSeries) {
                    await adjustExtractsPerSeries(results, mod.property, options);
                }
            }
            return results;
        })
        .then(results => {
            // Return results to the console or save crawl results to an
            // index.json file
            if (options.terse) {
                const property = options.modules[0].property;
                results = results.map(result => {
                    let res = result[property];
                    if (property === 'idl') {
                        res = res?.idl;
                    }
                    return res;
                });
                if (results.length === 1) {
                    results = results[0];
                }
                console.log(typeof results === 'string' ?
                    results : JSON.stringify(results, null, 2));
            }
            else if (!options.output) {
                console.log(JSON.stringify(results, null, 2));
            }
            else {
                return saveResults(results, options);
            }
        })
        .then(async crawlIndex => {
            // Generate IDL names extracts from IDL extracts
            // (and dfns extracts to create links to definitions)
            if (!options.output || !crawlIndex?.options?.modules?.find(mod => mod === 'idl')) {
                return;
            }
            const crawlResults = await expandCrawlResult(crawlIndex, options.output, ['idlparsed', 'dfns']);
            const idlNames = generateIdlNames(crawlResults.results, options);
            await saveIdlNames(idlNames, options.output);
        });
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
            console.error('Module input cannot have more than one ":" character');
            process.exit(2);
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

    function parseSpecOption(input) {
        if (input === 'all') {
            return specs.map(s => s.shortname);
        }
        else {
            const list = requireFromWorkingDirectory(input);
            return list ?? input;
        }
    }

    const program = new commander.Command();
    program
        .version(version)
        .usage('[options]')
        .description('Crawls and processes a list of Web specifications')
        .option('-d, --debug', 'debug mode, crawl one spec at a time')
        .option('-m, --module <modules...>', 'spec processing modules')
        .option('-o, --output <folder>', 'existing folder/file where crawl results are to be saved')
        .option('-q, --quiet', 'do not report progress and other warnings to the console')
        .option('-r, --release', 'crawl release (TR) version of specs')
        .option('-s, --spec <specs...>', 'specs to crawl')
        .option('-t, --terse', 'output crawl results without metadata')
        .action(options => {
            const crawlOptions = {
                debug: options.debug,
                output: options.output,
                publishedVersion: options.release,
                quiet: options.quiet,
                terse: options.terse
            };
            if (options.module) {
                crawlOptions.modules = options.module.map(parseModuleOption);
            }
            if (options.spec) {
                crawlOptions.specs = options.spec.map(parseSpecOption).flat();
            }

            if (crawlOptions.terse && crawlOptions.output) {
                console.error('The --terse option cannot be combined with the --output option');
                process.exit(2);
            }
            if (crawlOptions.terse && (!crawlOptions.modules || crawlOptions.modules.length === 0 || crawlOptions.modules.length > 1)) {
                console.error('The --terse option can be only be set when only one core processing module runs');
                process.exit(2);
            }
            crawlSpecs(crawlOptions)
                .then(_ => {
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

Description:
  Crawls a set of specifications and runs processing modules against each of
  them to generate extracts.

  Crawl results are written to the console as a serialized JSON array with one
  entry per spec by default. The order of the specs in the array matches the
  order of the specs provided as input (or the order of the specs in
  browser-specs if no explicit spec was provided).

  Resulting array may be large. Crawling all specs with core processing module
  produces ~100MB of serialized JSON for instance. To avoid janking the console
  or running into possible memory issues, setting the --output option is
  strongly recommended.

Usage notes for some of the options:
-m, --module <modules...>
  If processing modules are not specified, the crawler runs all core processing
  modules defined in:
    https://github.com/w3c/reffy/tree/main/src/reffy.json

  Modules must be specified using a relative path to an ".mjs" file that defines
  the processing logic to run on the spec's page in a browser context. For
  instance:
    $ node crawl-specs.js reports/test --module extract-editors.mjs

  Absolute paths to modules are not properly handled and will likely result in a
  crawling error.

  Multiple modules can be specified, repeating the option name or not:
    $ node crawl-specs.js reports/test -m extract-words.mjs extract-editors.mjs
    $ node crawl-specs.js reports/test -m extract-words.mjs -m extract-editors.mjs

  The option cannot appear before <folder>, unless you use "--" to flag the end
  of the list:
    $ node crawl-specs.js --module extract-editors.mjs -- reports/test

  Core processing modules may be referenced using the name of the extract folder
  or property that they would create:
    $ node crawl-specs.js reports/test --module dfns

  To run all core processing modules, use "core". For instance, to apply a
  processing module on top of core processing modules, use:
    $ node crawl-specs.js reports/test --module core extract-editors.mjs

  Each module must export a function that takes a spec object as input and
  return a result that can be serialized as JSON. A typical module code looks
  like:
    https://github.com/w3c/reffy/blob/main/src/browserlib/extract-ids.mjs

  Individual extracts will be created under "<folder>/[camelCaseModule]" where
  "[camelCaseModule]" is derived from the module's filename. For instance:
    "extract-editors.mjs" creates extracts under "<folder>/extractEditors"

  The name of the folder where extracts get created may be specified for custom
  modules by prefixing the path to the module with the folder name followed by
  ":". For instance, to save extracts to "reports/test/editors", use:
    $ node crawl-specs.js reports/test --module editors:extract-editors.mjs

-o, --output <folder>
  By default, crawl results are written to the console as a serialized JSON
  array with one entry per spec, and module processing results attached as
  property values in each of these entries.

  If an output <folder> is specified, crawl results are rather saved to that
  folder, with module processing results created under subfolders (see the
  --module option) and linked from an index.json file created under <folder>.

  Additionally, if an output <folder> is specified and if the IDL processing
  module is run, the crawler will also creates an index of IDL names named
  "idlnames.json" that links to relevant extracts in subfolders.

-r, --release
  If the flag is not set, the crawler defaults to crawl nightly versions of the
  specs.

-s, --spec <specs...>
  If specs to crawl are not specified, all specs in browser-specs get crawled:
    https://github.com/w3c/browser-specs/

  Valid spec values may be a shortname, a URL, or a relative path to a file that
  contains a list of spec URLs and/or shortnames. All shortnames must exist in
  browser-specs.

  Use "all" to include all specs in browser-specs in the crawl. For instance, to
  crawl all specs plus one custom spec that does not exist in browser-specs:
    $ node crawl-specs.js reports/test -s all https://example.org/myspec

-t, --terse
  This flag cannot be combined with the --output option and cannot be set if
  more than one processing module gets run. When set, the crawler writes the
  processing module results to the console directly without wrapping them with
  spec metadata. In other words, the spec entry in the crawl results directly
  contains the outcome of the processing module when the flag is set.

  Additionally, if crawl runs on a single specification, the array is omitted
  and the processing module results are thus written to the console directly.
  For instance:
    $ node crawl-specs.js --spec fetch --module idl --terse
`);

    program.parse(process.argv);
}
