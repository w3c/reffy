#!/usr/bin/env node
/**
 * The crawl report merger can be used to merge a new crawl report into a
 * reference one. This tool is typically useful to make incremental updates to a
 * reference crawl, used as knowledge database. It replaces the crawl results of
 * a given spec by the new results where appropriate.
 *
 * The crawl report merge can be called directly through:
 *
 * `node merge-crawl-results.js [new report] [ref report] [merged report]`
 *
 * where `new report` is the name of the new report to merge into `ref report`
 * to produce the `merged report` file.
 *
 * @module merger
 */

import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { loadJSON } from '../lib/util.js';


/**
 * Compares specs for ordering by URL
 */
const byURL = (a, b) => a.url.localeCompare(b.url);


/**
 * Merge given crawl results with the given reference crawl results and return
 * the new results.
 *
 * @function
 * @param {String} newCrawl The crawl results to merge
 * @param {String} refCrawl The reference crawl results
 * @param {Object} options Merge options. Only "matchTitle" is supported for now
 * @return {Promise} The promise to get a new crawl results that contains the
 *   results of the merge
 */
function mergeCrawlResults(newCrawl, refCrawl, options) {
    options = options || {};

    let newResults = newCrawl.results || [];
    let refResults = refCrawl.results || [];

    let results = refResults.filter(refSpec => !newResults.some(newSpec =>
        (refSpec.url && newSpec.url && (refSpec.url === newSpec.url)) ||
        (refSpec.html && newSpec.html && (refSpec.html === newSpec.html)) ||
        (refSpec.latest && newSpec.latest && (refSpec.latest === newSpec.latest)) ||
        (refSpec.shortname && newSpec.shortname && (refSpec.shortname === newSpec.shortname)) ||
        (refSpec.versions && newSpec.versions &&
            refSpec.versions.some(refVersion => newSpec.versions.some(newVersion => (refVersion === newVersion)))) ||
        (options.matchTitle && refSpec.title && newSpec.title && (refSpec.title === newSpec.title))
    )).concat(newResults);

    let crawlData = {};
    crawlData.title = newCrawl.title || refCrawl.title || 'Reffy crawl';
    if (newCrawl.description || refCrawl.description) {
        crawlData.description = newCrawl.description || refCrawl.description;
    }
    crawlData.date = (new Date()).toJSON();
    crawlData.stats = {};
    crawlData.results = results;
    crawlData.results.sort(byURL);
    crawlData.stats = {
        crawled: crawlData.results.length,
        errors: crawlData.results.filter(spec => !!spec.error).length
    };

    return Promise.resolve(crawlData);
}


/**
 * Merge the crawl results in the first JSON file with the crawl results in the
 * second JSON file, and create a third JSON file with the results.
 *
 * @function
 * @param {String} newCrawlPath The JSON file that contains the results to merge
 * @param {String} refCrawlPath The JSON file that contains the reference results
 * @param {String} resPath The JSON file that will contain the result of the merge
 * @param {Object} options Merge options. Only "matchTitle" is supported for now
 * @return {Promise} The promise to have merged the two JSON files into one
 */
async function mergeCrawlFiles(newCrawlPath, refCrawlPath, resPath, options) {
    options = options || {};

    let newCrawl = await loadJSON(newCrawlPath);
    let refCrawl = await loadJSON(refCrawlPath);
    return mergeCrawlResults(newCrawl, refCrawl, options)
        .then(filedata => new Promise((resolve, reject) =>
            fs.writeFile(resPath, JSON.stringify(filedata, null, 2),
                     err => { if (err) return reject(err); resolve(); })))
}


/**************************************************
Export the methods for use as module
**************************************************/
export {
    mergeCrawlResults,
    mergeCrawlFiles
};


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    let newCrawlPath = process.argv[2];
    let refCrawlPath = process.argv[3];
    let resPath = process.argv[4];
    if (!newCrawlPath || !refCrawlPath || !resPath) {
        console.error('Command needs 3 filename parameters:');
        console.error(' 1. the crawl results to merge into the reference crawl results');
        console.error(' 2. the reference crawl results');
        console.error(' 3. where to save the result of the merge');
        process.exit(2);
    }
    let mergeOptions = {
        matchTitle: true
    };

    console.log('Merging crawl files into: ' + resPath);
    mergeCrawlFiles(newCrawlPath, refCrawlPath, resPath, mergeOptions)
        .then(_ => console.log('Finished'))
        .catch(err => {
            console.error(err);
            process.exit(64)
        });
}
