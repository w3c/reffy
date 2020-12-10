#!/usr/bin/env node
/**
 * The references parser takes the URL of a spec as input, loads that spec and
 * extracts the list of normative/informative references that it contains. The
 * parser uses some hardcoded logic to detect the "References" section in specs
 * that depend on the spec generator that may be used by the spec (ReSpec,
 * Bikeshed, or nothing).
 *
 * The references parser is used by the [crawler]{@link module:crawler} to
 * populate the references sections of the crawl report.
 *
 * The references parser can be called directly through:
 *
 * `node parse-references.js [url]`
 *
 * where `url` is the URL of the spec to parse for references.
 *
 * @module referencesParser
 */

const processSpecification = require('../lib/util').processSpecification;


/**
 * Main method that takes the URL of a specification, loads that spec
 * and extract the list of normative/informative references that it contains
 *
 * @function
 * @public
 * @param {String} url The URL of the specification
 * @return {Promise} The promise to get a list of normative/informative
 *   references
 */
async function extract(url) {
    const result = await processSpecification(url, () => {
        return window.reffy.extractReferences();
    });
    return result;
}


/**************************************************
Export the extract method for use as module
**************************************************/
module.exports.extract = extract;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    const url = process.argv[2];
    if (!url) {
        console.error('Required URL parameter missing');
        process.exit(2);
    }
    const { setupBrowser, teardownBrowser } = require('../lib/util');
    setupBrowser()
        .then(_ => extract(url))
        .then(references => console.log(JSON.stringify(references, null, 2)))
        .then(teardownBrowser)
        .catch(err => {
            console.error(err);
            process.exit(64);
        });
}
