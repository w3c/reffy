#!/usr/bin/env node
/**
 * The CSS definitions extractor takes the URL of a spec as input and outputs
 * a structured JSON-like object that contains the CSS definitions found in the
 * spec.
 *
 * The CSS definitions extractor can be called directly through:
 *
 * `node extract-cssdfn.js [url]`
 *
 * where `url` is the URL of the spec to fetch and parse.
 *
 * @module cssExtractor
 */

const processSpecification = require('../lib/util').processSpecification;


/**
 * Main method that takes the URL of a specification, loads that spec
 * and extract the list of CSS definitions that it contains
 *
 * @function
 * @public
 * @param {String} url The URL of the specification
 * @return {Promise} The promise to get a dump of the CSS definitions as a JSON
 *   object whose first-level keys are "properties" and "descriptors"
 */
async function extract(url) {
  const result = await processSpecification(url, () => {
    return window.reffy.extractCSS();
  });
  return result;
};


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
    extract(url)
      .then(css => console.log(JSON.stringify(css, null, 2)))
      .catch(err => {
        console.error(err);
        process.exit(64);
      });
}
