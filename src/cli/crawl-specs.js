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

const fs = require('fs');
const path = require('path');
const specs = require('browser-specs');
const webidlParser = require('./parse-webidl');
const cssDfnParser = require('../lib/css-grammar-parser');
const fetch = require('../lib/util').fetch;
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const completeWithAlternativeUrls = require('../lib/util').completeWithAlternativeUrls;
const isLatestLevelThatPasses = require('../lib/util').isLatestLevelThatPasses;
const processSpecification = require('../lib/util').processSpecification;
const { setupBrowser, teardownBrowser } = require('../lib/util');
const { generateIdlNames, saveIdlNames } = require('./generate-idlnames');

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
    spec.date = "";
    spec.links = {};
    spec.refs = {};
    spec.idl = {};
    if (spec.error) {
        return spec;
    }

    try {
        const result = await processSpecification(spec.crawled, (spec) => {
            const idToHeading = window.reffy.mapIdsToHeadings();
            return {
                crawled: window.location.toString(),
                title: window.reffy.getTitle(),
                generator: window.reffy.getGenerator(),
                date: window.reffy.getLastModifiedDate(),
                links: window.reffy.extractLinks(),
                dfns: window.reffy.extractDefinitions(spec.shortname, idToHeading),
                headings: window.reffy.extractHeadings(idToHeading),
                ids: window.reffy.extractIds(),
                refs: window.reffy.extractReferences(),
                idl: window.reffy.extractWebIdl(),
                css: window.reffy.extractCSS()
            };
        }, [spec]);

        // Parse the extracted WebIdl content
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

        // Add CSS property definitions that weren't in a table
        (result.dfns || []).filter((dfn) => dfn.type == "property").forEach(propDfn => {
            propDfn.linkingText.forEach(lt => {
                if (!result.css.properties.hasOwnProperty(lt)) {
                    result.css.properties[lt] = {
                        name: lt
                    };
                }
            });
        });

        // Ideally, the sample definition (property-name) in CSS2 and the custom
        // property definition (--*) in CSS Variables would not be flagged as
        // real CSS properties. In practice, they are. Let's remove them from
        // the extract.
        ['property-name', '--*'].forEach(prop => {
            if ((result.css.properties || {})[prop]) {
                delete result.css.properties[prop];
            }
        });

        // Parse extracted CSS definitions
        Object.entries(result.css.properties || {}).forEach(([prop, dfn]) => {
            if (dfn.value || dfn.newValues) {
                try {
                    dfn.parsedValue = cssDfnParser.parsePropDefValue(
                        dfn.value || dfn.newValues);
                } catch (e) {
                    dfn.valueParseError = e.message;
                }
            }
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

        // Copy results back into initial spec object
        spec.crawled = result.crawled;
        spec.title = result.title ? result.title : spec.title;
        spec.generator = result.generator;
        spec.date = result.date;
        spec.links = result.links;
        spec.refs = result.refs;
        spec.idl = result.idl;
        spec.css = result.css;
        spec.dfns = result.dfns;
        spec.headings = result.headings;
        spec.ids = result.ids;
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
    await setupBrowser();

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

    const folders = {
        css: await getSubfolder('css'),
        dfns: await getSubfolder('dfns'),
        ids: await getSubfolder('ids'),
        headings: await getSubfolder('headings'),
        idl: await getSubfolder('idl'),
        idlparsed: await getSubfolder('idlparsed'),
        idlnamesparsed: await getSubfolder('idlnamesparsed'),
        links: await getSubfolder('links'),
        refs: await getSubfolder('refs')
    };

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

    // Prepare and save IDL names exports
    const idlNames = generateIdlNames(data);
    await saveIdlNames(idlNames, folders.idlnamesparsed);

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

    // TODO: Legacy code, drop when crawl.json is no longer used anywhere
    // Save all results to the crawl.json file
    let reportFilename = path.join(folder, 'crawl.json');
    await new Promise((resolve, reject) =>
        fs.readFile(reportFilename, function(err, content) {
            if (err) return reject(err);

            let filedata = {};
            try {
                filedata = JSON.parse(content);
            } catch (e) {}

            filedata.type = filedata.type || 'crawl';
            filedata.title = 'Reffy crawl';
            filedata.date = filedata.date || (new Date()).toJSON();
            filedata.options = crawlOptions;
            filedata.stats = {};
            filedata.results = (filedata.results || []).concat(data);
            filedata.results.sort(byURL);
            filedata.stats = {
                crawled: filedata.results.length,
                errors: filedata.results.filter(spec => !!spec.error).length
            };

            fs.writeFile(reportFilename, JSON.stringify(filedata, null, 2),
                         err => { if (err) return reject(err); return resolve();});
        })
    );

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
    // TODO: crawl.json contains the CSS dumps for earlier levels in a series,
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

    // Save definitions, links, headings, and refs for individual specs
    await Promise.all(data.map(getSavePropFunction('dfns',
        spec => spec.dfns && (spec.dfns.length > 0))));
    await Promise.all(data.map(getSavePropFunction('links',
        spec => spec.links && (Object.keys(spec.links).length > 0))));
    await Promise.all(data.map(getSavePropFunction('headings',
        spec => spec.headings && (spec.headings.length > 0))));
    await Promise.all(data.map(getSavePropFunction('ids',
        spec => spec.ids && (spec.ids.length > 0))));
    await Promise.all(data.map(getSavePropFunction('refs',
        spec => spec.refs &&
            ((spec.refs.normative && spec.refs.normative.length > 0) ||
             (spec.refs.informative && spec.refs.informative.length > 0)))));

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

        // TODO: Legacy code, drop when crawl.json is no longer used anywhere
        fs.writeFileSync(path.join(resultsPath, 'crawl.json'), '');
    } catch (err) {
        return Promise.reject('Impossible to write to ' + resultsPath + ': ' + err);
    }

    function prepareListOfSpecs(list) {
        return list
            .map(spec => (typeof spec === 'string') ?
                specs.find(s => s.url === spec || s.shortname === spec) :
                spec)
            .filter(spec => !!spec);
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
    var resultsPath = (process.argv[2] && process.argv[2].endsWith('.json')) ?
            process.argv[3] : process.argv[2];
    var crawlOptions = {
        specFile: process.argv.find(arg => arg.endsWith('.json')),
        publishedVersion: !!process.argv.find(arg => arg === 'tr'),
        debug: !!process.argv.find(arg => arg === 'debug')
    };

    // Process the file and crawl specifications it contains
    crawlSpecs(resultsPath, crawlOptions)
        .then(_ => {
            console.log('Finished');
            process.exit(0);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
