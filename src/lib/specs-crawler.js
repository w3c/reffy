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
const specs = require('web-specs');
const inspect = require('util').inspect;
const cssDfnParser = require('./css-grammar-parser');
const postProcessor = require('./post-processor');
const ThrottledQueue = require('./throttled-queue');
const {
    completeWithAlternativeUrls,
    expandBrowserModules,
    expandCrawlResult,
    expandSpecResult,
    isLatestLevelThatPasses,
    processSpecification,
    requireFromWorkingDirectory,
    setupBrowser,
    teardownBrowser,
    createFolderIfNeeded
} = require('./util');

const {version: reffyVersion} = require('../../package.json');


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
            result.error = spec.error;
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

    const urlToCrawl = crawlOptions.publishedVersion ?
        (spec.release ? spec.release : spec.nightly) :
        spec.nightly;
    const fallbackFolder = crawlOptions.fallback ?
        path.dirname(crawlOptions.fallback) : '';

    try {
        const fallback = crawlOptions.fallbackData?.results?.find(s => s.url === spec.url);
        let cacheInfo = {};
        if (crawlOptions.fallbackData?.crawler === `reffy-${reffyVersion}`) {
          cacheInfo = Object.assign({}, fallback?.crawlCacheInfo);
        }
        let result = null;
        if (crawlOptions.useCrawl) {
            result = await expandSpecResult(spec, crawlOptions.useCrawl);
        }
        else if (!urlToCrawl) {
            // No nightly URL? That means the spec is not public (typical
            // example here is ISO specs). Nothing to crawl in such cases.
            result = {};
        }
        else {
            result = await processSpecification(
                urlToCrawl,
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
                  ...cacheInfo}
            );
            if (result.status === "notmodified" && fallback) {
              crawlOptions.quiet ?? console.warn(`skipping ${spec.url}, no change`);
              const copy = Object.assign({}, fallback);
              return expandSpecResult(copy, fallbackFolder);
            }
        }

        // Run post-processing modules at the spec level
        for (const mod of (crawlOptions.post ?? [])) {
            await postProcessor.run(mod, result, crawlOptions);
        }

        // Copy results back into initial spec object
        if (result.crawled) {
            spec.crawled = result.crawled;
        }
        if (result.crawlCacheInfo) {
          spec.crawlCacheInfo = result.crawlCacheInfo;
        }
        crawlOptions.modules.forEach(mod => {
            if (result[mod.property]) {
                spec[mod.property] = result[mod.property];
            }
        });
        crawlOptions.post?.forEach(mod => {
            const prop = postProcessor.getProperty(mod);
            if (postProcessor.appliesAtLevel(mod, 'spec') && result[prop]) {
                spec[prop] = result[prop];
            }
        });
    }
    catch (err) {
        spec.title = spec.title || '[Could not be determined, see error]';
        spec.error = inspect(err);
    }

    return specOrFallback(spec, fallbackFolder, crawlOptions.fallbackData?.results);
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

    // Save CSS dumps
    function defineCSSContent(spec) {
        return (spec.css?.properties?.length > 0) ||
               (spec.css?.atrules?.length > 0) ||
               (spec.css?.selectors?.length > 0) ||
               (spec.css?.values?.length > 0) ||
               (spec.css?.warnings?.length > 0);
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

    // Save all other extracts from crawling modules
    const remainingModules = modules.filter(mod =>
        !mod.metadata && mod.property !== 'css' && mod.property !== 'idl');
    for (const mod of remainingModules) {
        await saveExtract(spec, mod.property, spec => !isEmpty(spec[mod.property]));
    }

    // Save extracts from post-processing modules that run at the spec level
    for (const mod of (settings.post ?? [])) {
        await postProcessor.save(mod, spec, settings);
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
    crawlOptions = Object.assign({speclist}, crawlOptions);

    // Expand list of processing modules to use if not already done
    crawlOptions.modules = expandBrowserModules(crawlOptions.modules);

    // Load fallback data if necessary
    if (crawlOptions.fallback) {
        try {
            crawlOptions.fallbackData = JSON.parse(await fs.promises.readFile(crawlOptions.fallback));
        } catch (e) {
            throw new Error(`Could not parse fallback data file ${crawlOptions.fallback}`);
        }
    }

    // Prepare Puppeteer instance unless we already have crawl results and
    // we're only interested in post-processing
    let list = null;
    if (crawlOptions.useCrawl) {
        list = speclist;
    }
    else {
        await setupBrowser(crawlOptions.modules);
        list = speclist.map(completeWithAlternativeUrls);
    }

    // Filter out non-published specs when goal is to crawl published versions
    if (crawlOptions.publishedVersion) {
        list = list.filter(spec => !!spec.release);
    }

    const nbStr = '' + list.length;
    async function processSpec(spec, idx) {
        const logCounter = ('' + (idx + 1)).padStart(nbStr.length, ' ') + '/' + nbStr;
        crawlOptions.quiet ?? console.warn(`${logCounter} - ${spec.url} - crawling`);
        let result = await crawlSpec(spec, crawlOptions);
        result = await saveSpecResults(result, crawlOptions);
        crawlOptions.quiet ?? console.warn(`${logCounter} - ${spec.url} - done`);
        return result;
    }

    const crawlQueue = new ThrottledQueue(4);
    const results = await Promise.all(list.map((spec, idx) => {
        const versionToCrawl = crawlOptions.publishedVersion ?
            (spec.release ? spec.release : spec.nightly) :
            spec.nightly;
        const urlToCrawl = versionToCrawl?.url;
        return crawlQueue.runThrottledPerOrigin(urlToCrawl, processSpec, spec, idx);
    }));

    // Close Puppeteer instance
    if (!crawlOptions.useCrawl) {
        teardownBrowser();
    }

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
            // Full level, rename the extract after the series' shortname,
            // unless we're dealing with a fork spec, in which case, we'll
            // drop the created extract (not to run into IDL duplication issues)
            if (spec.seriesComposition === 'fork') {
                const pathname = path.resolve(settings.output, spec[property]);
                fs.unlinkSync(pathname);
                delete spec[property];
            }
            else {
                const pathname = path.resolve(settings.output, spec[property]);
                spec[property] = `${property}/${spec.series.shortname}${path.extname(spec[property])}`;
                const newpathname = path.resolve(settings.output, spec[property]);
                fs.renameSync(pathname, newpathname);
            }
        }
        else if (deltaLevels.includes(spec)) {
            // Delta level, need to keep the extract as-is
        }
        else if (spec[property]) {
            // Not the right full level in the series, drop created extract
            const pathname = path.resolve(settings.output, spec[property]);
            fs.unlinkSync(pathname);
            delete spec[property];
        }
    });

    return data;
}


/**
 * Saves the crawl results to an index.json file.
 *
 * @function
 * @param {Array(Object)} contents The contents to save
 * @param {Object} settings Crawl settings. The function does not create any
 *   save file if the "output" setting is not set.
 * @return {Promise<void>} The promise to have saved the data
 */
async function saveResults(contents, settings) {
    if (!settings.output) {
        return;
    }
    const indexFilename = path.join(settings.output, 'index.json');
    await fs.promises.writeFile(indexFilename, JSON.stringify(contents, null, 2));
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

    const crawlIndex = options?.useCrawl ?
        requireFromWorkingDirectory(options.useCrawl) :
        null;

    const requestedList = crawlIndex ? crawlIndex.results :
        options?.specs ? prepareListOfSpecs(options.specs) :
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
            for (const mod of options.post ?? []) {
                if (postProcessor.extractsPerSeries(mod)) {
                    await adjustExtractsPerSeries(results, mod.property, options);
                }
            }
            return results;
        })
        .then(async results => {
            // Create and return a crawl index out of the results, to allow
            // post-processing modules to run.
            const index = {
                type: 'crawl',
                title: 'Reffy crawl',
                date: (new Date()).toJSON(),
                options: Object.assign({}, options, {
                    modules: options.modules.map(mod => mod.property)
                }),
                stats: {},
                crawler: `reffy-${reffyVersion}`,
                results
            };
            index.stats = {
                crawled: results.length,
                errors: results.filter(spec => !!spec.error).length
            };

            // Return results to the console or save crawl results to an
            // index.json file
            if (options.terse) {
                const property = options.modules[0].property;
                results = results.map(result => {
                    let res = result[property];
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
                await saveResults(index, options);
            }
            return index;
        })
        .then(async crawlIndex => {
            // Run post-processing modules at the crawl level
            for (const mod of (options.post ?? [])) {
                if (!postProcessor.appliesAtLevel(mod, 'crawl')) {
                    continue;
                }
                const crawlResults = options.output ?
                    await expandCrawlResult(
                        crawlIndex, options.output, postProcessor.dependsOn(mod)) :
                    crawlIndex;
                const result = await postProcessor.run(mod, crawlResults, options);
                await postProcessor.save(mod, result, options);

                if (!options.output) {
                    console.log();
                    console.log(JSON.stringify(result, null, 2));
                }
            }
        });
}


/**************************************************
Export methods for use as module
**************************************************/
// TODO: consider more alignment between the two crawl functions or
// find more explicit names to distinguish between them:
// - "crawlList" takes an explicit list of specs as input, does not run the
// post-processor, and returns the results without saving them to files.
// - "crawlSpecs" takes options as input, runs all steps and saves results
// to files (or outputs the results to the console). It does not return
// anything.
module.exports.crawlSpecs = (...args) => Array.isArray(args[0]) ?
    crawlList.apply(this, args) :
    crawlSpecs.apply(this, args);
