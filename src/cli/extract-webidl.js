#!/usr/bin/env node
/**
 * The WebIDL extractor takes the URL of a spec as input and outputs the WebIDL
 * definitions found in the spec as one block of text
 *
 * The WebIDL extractor can be called directly through:
 *
 * `node extract-webidl.js [url]`
 *
 * where `url` is the URL of the spec to fetch and parse.
 *
 * @module webidlExtractor
 */

const processSpecification = require('../lib/util').processSpecification;


/**
 * Main method that takes the URL of a specification, loads that spec
 * and extract the list of WebIDL definitions that it contains
 *
 * @function
 * @private
 * @param {String} url The URL of the specification
 * @return {Promise} The promise to get a dump of the IDL definitions, or
 *   an empty string if the spec does not contain any IDL.
 */
async function extract(url) {
    const result = await processSpecification(url, () => {
        return window.reffy.extractWebIdl();
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
        .then(idl => console.log(idl))
        .then(teardownBrowser)
        .catch(err => {
            console.error(err);
            process.exit(64);
        });
}

