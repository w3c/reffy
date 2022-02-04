#!/usr/bin/env node
/**
 * The spec crawler takes a list of spec URLs as input, gathers some knowledge
 * about these specs (published versions, URL of the Editor's Draft, etc.),
 * fetches these specs, parses them, extracts relevant information that they
 * contain (such as the WebIDL they define, the list of specifications that they
 * reference, and links to external specs), and produces a crawl report with the
 * results of these investigations.
 *
 * @module crawler
 */

const fs = require('fs');
const path = require('path');
const specs = require('browser-specs');
const cssDfnParser = require('./css-grammar-parser');
const { generateIdlParsed, saveIdlParsed } = require('../cli/generate-idlparsed');
const { generateIdlNames, saveIdlNames } = require('../cli/generate-idlnames');
const {
    completeWithAlternativeUrls,
    expandBrowserModules,
    expandCrawlResult,
    expandSpecResult,
    getGeneratedIDLNamesByCSSProperty,
    isLatestLevelThatPasses,
    processSpecification,
    setupBrowser,
    teardownBrowser,
    createFolderIfNeeded
} = require('./util');


/**
 * Return the spec if crawl succeeded or crawl result from given fallback list
 * if crawl yielded an error (and fallback does exist).
 *
 * The function keeps the "error" property on the crawl result it returns so
 * that the error does not get entirely lost.
 *
 * @function
 * @param {Object} spec Actual spec crawl result
 * * @param {Object} spec Actual spec crawl result
 * @param {String} fallbackFolder The folder that contains fallback extracts
 * @param {Array<Object>} fallbackData A list of crawl results to use as
 *   fallback when needed
 * @return {Object} The given crawl result or a new one that reuses fallback
 *   content if needed
 */
async function specOrFallback(spec, fallbackFolder, fallbackData) {
    if (spec.error && fallbackData) {
        const fallback = fallbackData.find(s => s.url === spec.url);
        if (fallback) {
            const copy = Object.assign({}, fallback);
            const result = await expandSpecResult(copy, fallbackFolder);
            return result;
        }
    }
    return spec;
}


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
    const fallbackFolder = crawlOptions.fallback ?
        path.dirname(crawlOptions.fallback) : '';

    if (spec.error) {
        return specOrFallback(spec, fallbackFolder, crawlOptions.fallbackData);
    }

    try {
        const fallback = crawlOptions.fallbackData?.find(s => s.url === spec.url);
        const etag = fallback?.crawlCacheInfo?.etag;
        const lastModified = fallback?.crawlCacheInfo?.lastModified;
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
            { quiet: crawlOptions.quiet,
              forceLocalFetch: crawlOptions.forceLocalFetch,
              etag, lastModified}
        );
        if (result.error === "reuseexistingdata" && fallback) {
          crawlOptions.quiet ?? console.warn(`skipping ${spec.url}, no change`);          const copy = Object.assign({}, fallback);
          return expandSpecResult(copy, fallbackFolder);
        }

        // Specific rule for IDL extracts:
        // parse the extracted WebIdl content
        await generateIdlParsed(result);

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
        spec.crawlCacheInfo = result.crawlCacheInfo;
        crawlOptions.modules.forEach(mod => {
            if (result[mod.property]) {
                spec[mod.property] = result[mod.property];
                if (mod.property === 'idl') {
                    spec.idlparsed = result.idlparsed;
                }
            }
        });
    }
    catch (err) {
        spec.title = spec.title || '[Could not be determined, see error]';
        spec.error = err.toString() + (err.stack ? ' ' + err.stack : '');
    }

    return specOrFallback(spec, fallbackFolder, crawlOptions.fallbackData);
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
 *   "output" and "quiet". See CLI help (node reffy.js --help) for details.
 *   The "modules" setting is mandatory and note that the function will not do
 *   anything if "output" is not set.
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
        await createFolderIfNeeded(subfolder);
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
        const idl = idlHeader + spec.idl + '\n';
        await fs.promises.writeFile(
            path.join(folders.idl, spec.shortname + '.idl'), idl);
        return `idl/${spec.shortname}.idl`;
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
        return `css/${spec.shortname}.json`;
    };

    // Save IDL dumps
    if (spec.idl) {
        spec.idl = await saveIdl(spec);
    }
    if (spec.idlparsed) {
        spec.idlparsed = await saveIdlParsed(spec, settings.output);
    }

    // Save CSS dumps
    function defineCSSContent(spec) {
        return spec.css && (
            (Object.keys(spec.css.properties || {}).length > 0) ||
            (Object.keys(spec.css.descriptors || {}).length > 0) ||
            (Object.keys(spec.css.valuespaces || {}).length > 0));
    }
    if (defineCSSContent(spec)) {
        spec.css = await saveCss(spec);
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
    // Make a shallow copy of crawl options object since we're going
    // to modify properties in place
    crawlOptions = Object.assign({}, crawlOptions);

    // Expand list of processing modules to use if not already done
    crawlOptions.modules = expandBrowserModules(crawlOptions.modules);

    // Load fallback data if necessary
    if (crawlOptions.fallback) {
        try {
            crawlOptions.fallbackData = JSON.parse(await fs.promises.readFile(crawlOptions.fallback)).results;
        } catch (e) {
            throw new Error(`Could not parse fallback data file ${crawlOptions.fallback}`);
        }
    }

    // Prepare Puppeteer instance
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
 *   See CLI help (node reffy.js --help) for details.
 * @return {Promise<void>} The promise that the crawl will have been made
 */
function crawlSpecs(options) {
    function prepareListOfSpecs(list) {
        return list.map(spec => {
            if (typeof spec !== 'string') {
                return spec;
            }
            let match = specs.find(s => s.url === spec || s.shortname === spec);
            if (!match) {
                match = specs.find(s => s.series &&
                    s.series.shortname === spec &&
                    s.series.currentSpecification === s.shortname);
            }
            if (match) {
                return match;
            }

            let url = null;
            try {
                url = (new URL(spec)).href;
            }
            catch {
                if (spec.endsWith('.html')) {
                    url = (new URL(spec, `file://${process.cwd()}/`)).href;
                }
                else {
                    const msg = `Spec ID "${spec}" can neither be interpreted as a URL, a valid shortname or a relative path to an HTML file`;
                    throw new Error(msg);
                }
            }
            return {
                url,
                nightly: { url },
                shortname: spec.replace(/[:\/\\\.]/g, ''),
                series: {
                    shortname: spec.replace(/[:\/\\\.]/g, ''),
                }
            };
        });
    }

    const requestedList = options?.specs ?
        prepareListOfSpecs(options.specs) :
        specs;

    // Make a shallow copy of passed options parameter and expand modules
    // in place.
    options = Object.assign({}, options);
    options.modules = expandBrowserModules(options.modules);

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
