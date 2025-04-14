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

import fs from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import specs from 'web-specs' with { type: 'json' };
import postProcessor from './post-processor.js';
import ThrottledQueue from './throttled-queue.js';
import { generateSpecReport } from './markdown-report.js';
import {
    completeWithAlternativeUrls,
    expandBrowserModules,
    expandCrawlResult,
    expandSpecResult,
    isLatestLevelThatPasses,
    processSpecification,
    setupBrowser,
    teardownBrowser,
    createFolderIfNeeded,
    loadJSON,
    shouldSaveToFile
} from './util.js';

import packageConfig from '../../package.json' with { type: 'json' };
const reffyVersion = packageConfig.version;


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
        if (fallback && !fallback.error &&
                crawlOptions.fallbackData?.crawler === `reffy-${reffyVersion}`) {
            // Note: we don't want to reuse the previous crawl results if
            // there was an error because we don't really know whether these
            // results come from that previous crawl (in which case we should
            // crawl the spec again), or from a an earlier crawl where
            // everything went fine (in which case we could reuse the results
            // if the spec wasn't updated in the meantime).
            cacheInfo = Object.assign({}, fallback.crawlCacheInfo);
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
                  userAgent: `Reffy/${reffyVersion}`,
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
        if (result.crawlCacheInfo &&
            (result.crawled === spec.url ||
                result.crawled === spec.nightly?.url)) {
            // Note: Some redirection took place. That happens when, e.g., a
            // WICG spec gets moved to another group, until we update the URL
            // in browser-specs. Redirection is done through scripting. Reffy
            // follows the redirect but the cache info it receives from
            // Puppeteer is for the initial URL. We cannot rely on it!
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
    if (!shouldSaveToFile(settings)) {
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

    async function saveCddl(spec) {
        let cddlHeader = `
            ; GENERATED CONTENT - DO NOT EDIT
            ; Content was automatically extracted by Reffy into webref
            ; (https://github.com/w3c/webref)
            ; Source: ${spec.title} (${spec.crawled})`;
        cddlHeader = cddlHeader.replace(/^\s+/gm, '').trim() + '\n\n';
        const res = [];
        for (const cddlModule of spec.cddl) {
            const cddl = cddlHeader + cddlModule.cddl + '\n';
            const filename = spec.shortname +
                (cddlModule.name ? `-${cddlModule.name}` : '') +
                '.cddl';
            await fs.promises.writeFile(
                path.join(folders.cddl, filename), cddl);
            res.push({
                name: cddlModule.name,
                file: `cddl/${filename}`
            });
        }
        return res;
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

    // Save CDDL extracts (text files, multiple modules possible)
    if (!isEmpty(spec.cddl)) {
        spec.cddl = await saveCddl(spec);
    }

    // Save all other extracts from crawling modules
    const remainingModules = modules.filter(mod =>
        !mod.metadata && !['cddl', 'css', 'idl'].includes(mod.property));
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
 * Helper function that takes a list of specs as inputs and expands them to an
 * object suitable for crawling, with as much information as possible.
 *
 * @function
 * @param {Array(String|Object)} list A list of "specs", where each spec can be
 * a string that represents a spec's shortname, series shortname or URL, or an
 * object that already contains appropriate information.
 * @return {Array(Object)} An array of spec objects. Note: When a spec was
 * already described through an object, the function returns the object as-is
 * and makes no attempt at validating it.
 */
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


/**
 * Crawl the provided list of specifications and return an array with the crawl
 * results.
 *
 * Crawl options may be specified as a second parameter. The function ignores
 * options that affect the output such as `output`, `markdown` or `terse`. The
 * function also does not run post-processing modules that apply at the "crawl"
 * level.
 *
 * @function
 * @param {Array(String|Object)} speclist List of specs to crawl, where each
 * spec can be a string that represents a spec's shortname, series shortname or
 * URL, or an object that already contains appropriate information.
 * @param {Object} crawlOptions Crawl options
 * @return {Promise<Array(Object)} The promise to get an array with crawl
 *   results.
 */
async function crawlList(speclist, crawlOptions) {
    // Expand the list of specs to spec objects suitable for crawling
    speclist = prepareListOfSpecs(speclist);

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

    // Load post-processing modules as needed
    await postProcessor.loadModules(crawlOptions.post ?? []);

    const nbStr = '' + list.length;
    async function processSpec(spec, idx) {
        const logCounter = ('' + (idx + 1)).padStart(nbStr.length, ' ') + '/' + nbStr;
        crawlOptions.quiet ?? console.warn(`${logCounter} - ${spec.url} - crawling`);
        let result = await crawlSpec(spec, crawlOptions);
        result = await saveSpecResults(result, crawlOptions);
        crawlOptions.quiet ?? console.warn(`${logCounter} - ${spec.url} - done`);
        return result;
    }

    const crawlQueue = new ThrottledQueue({
        maxParallel: 4,
        sleepInterval: origin => {
            if (crawlOptions.useCrawl) {
                // Not an actual crawl, we're going to reuse previous crawl
                // results instead. No need to sleep!
                return 0;
            }
            switch (origin) {
            case 'https://csswg.org': return 2000;
            case 'https://www.w3.org': return 1000;
            default: return 100;
            }
        }
    });
    const results = await Promise.all(list.map((spec, idx) => {
        const versionToCrawl = crawlOptions.publishedVersion ?
            (spec.release ? spec.release : spec.nightly) :
            spec.nightly;
        const urlToCrawl = versionToCrawl?.url;
        return crawlQueue.runThrottledPerOrigin(urlToCrawl, processSpec, spec, idx);
    }));

    // Close Puppeteer instance
    if (!crawlOptions.useCrawl) {
        await teardownBrowser();
    }

    // Merge extracts per series when necessary (CSS/IDL extracts)
    for (const mod of crawlOptions.modules) {
        if (mod.extractsPerSeries) {
            await adjustExtractsPerSeries(results, mod.property, crawlOptions);
        }
    }
    for (const mod of crawlOptions.post ?? []) {
        if (postProcessor.extractsPerSeries(mod)) {
            await adjustExtractsPerSeries(results, mod.property, crawlOptions);
        }
    }

    // Attach a crawl summary in Markdown if so requested
    if (crawlOptions.markdown || crawlOptions.summary) {
        for (const res of results) {
            res.crawlSummary = await generateSpecReport(res);
        }
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
    if (!shouldSaveToFile(settings)) {
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
    if (!shouldSaveToFile(settings)) {
        return;
    }
    const indexFilename = path.join(settings.output, 'index.json');
    await fs.promises.writeFile(indexFilename, JSON.stringify(contents, null, 2));
}


/**
 * Run a crawl given a set of options.
 *
 * The set of options matches those defined in the CLI. The function crawls all
 * specs by default in particular.
 *
 * If the `output` option is not set, the function outputs a JSON dump of the
 * crawl results to the console (or a report in Markdown if the `markdown`
 * option is set) and does not return anything to the caller.
 *
 * If the `output` option is set to the magic value `{return}`, the function
 * outputs nothing but returns an object that represents the crawl results,
 * with the actual results per spec stored in a `results` property.
 *
 * If the `output` option is set to any other value, the function interprets it
 * as a folder, creates subfolders and files with crawl results in that folder,
 * with a root `index.json` entry point, and does not return anything.
 *
 * @function
 * @param {Object} options Crawl options. Possible options include:
 *   publishedVersion, debug, output, terse, modules and specs.
 *   See CLI help (node reffy.js --help) for details.
 * @return {Promise<void|Object>} The promise that the crawl will have been
 *   made along with the index of crawl results if the `output` option was set
 *   to the specific value `{return}`.
 */
async function crawlSpecs(options) {
    const crawlIndex = options?.useCrawl ?
        await loadJSON(path.join(options.useCrawl, 'index.json')) :
        null;
    const requestedList = crawlIndex ?
        crawlIndex.results :
        (options?.specs ?? specs);

    // Make a shallow copy of passed options parameter and expand modules
    // in place.
    options = Object.assign({}, options);
    options.modules = expandBrowserModules(options.modules);

    return crawlList(requestedList, options)
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
            else if (options.markdown) {
                console.log('# Crawl results');
                console.log();
                for (const res of results) {
                    console.log(`## ${res.title}`);
                    console.log(res.crawlSummary);
                    console.log();
                }
            }
            else if (!options.output) {
                console.log(JSON.stringify(results, null, 2));
            }
            else if (shouldSaveToFile(options)) {
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
                const crawlResults = shouldSaveToFile(options) ?
                    await expandCrawlResult(
                        crawlIndex, options.output, postProcessor.dependsOn(mod)) :
                    crawlIndex;
                const result = await postProcessor.run(mod, crawlResults, options);
                await postProcessor.save(mod, result, options);

                if (!options.output) {
                    console.log();
                    console.log(JSON.stringify(result, null, 2));
                }
                else if (!shouldSaveToFile(options)) {
                    // Attach the post-processing result to the index of the
                    // crawl results.
                    crawlIndex.post = crawlIndex.post ?? [];
                    crawlIndex.post.push({
                        mod: postProcessor.getProperty(mod),
                        result
                    });
                }
            }

            // Function does not return anything if it already reported the
            // results to the console or files. It returns the index of the
            // crawl results otherwise.
            if (!options.output || shouldSaveToFile(options)) {
                return;
            }
            return crawlIndex;
        });
}


/**
 * Crawl a set of specs according to the given set of crawl options.
 *
 * The function behaves differently depending on the parameters it receives.
 *
 * If it receives no parameter, the function behaves as it were called with a
 * single empty object as parameter.
 *
 * If it receives a single object as parameter, this object sets crawl options
 * (essentially matching CLI options). What the function outputs or returns
 * depends on the `output` option. If `output` is not set, the function outputs
 * a JSON dump of the index of the crawl results to the console and returns
 * nothing to the caller. If `output` is set to the "magic" value `{return}`,
 * the function does not output anything but returns the index of the crawl
 * results which a caller may then process in any way they wish. If `output` is
 * set to any other value, it defines a folder, the function saves crawl
 * results as folders and files in that folder and returns nothing.
 *
 * If it receives an array as first parameter, the array defines the set of
 * specs that are to be crawled (each spec may be a string representing the
 * spec's shortname, series shortname, or URL; or a spec object). The second
 * parameter, if present, defines additional crawl options (same as above,
 * except the `specs` option should not be set). The function returns an
 * array of crawl results to the caller.
 *
 * Note the function does not apply post-processing modules that run at the
 * "crawl" level when it receives an array as first parameter. It will also
 * ignore crawl options that control the output such as `output`, `markdown`
 * and `terse`.
 */
function crawl(...args) {
    return Array.isArray(args[0]) ?
        crawlList.apply(this, args) :
        crawlSpecs.apply(this, args);
}


/**************************************************
Export crawl method for use as module
**************************************************/
export { crawl as crawlSpecs };
