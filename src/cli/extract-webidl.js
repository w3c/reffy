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

const urlOrDom = require('../lib/util').urlOrDom;
const getDocumentAndGenerator = require('../lib/util').getDocumentAndGenerator;


/**
 * Main method that takes the URL of a specification, loads that spec
 * and extract the list of WebIDL definitions that it contains
 *
 * @function
 * @public
 * @param {String} url The URL of the specification
 * @return {Promise} The promise to get a dump of the IDL definitions, or
 *   an empty string if the spec does not contain any IDL.
 */
function extract(url) {
    return urlOrDom(url)
        .then(getDocumentAndGenerator)
        .then(function (data) {
            var doc = data.doc, generator = data.generator;
            if (generator === 'bikeshed') {
                return extractBikeshedIdl(doc);
            }
            else if (doc.title.startsWith('Web IDL')) {
                // IDL content in the Web IDL are... examples,
                // not real definitions
                return new Promise(resolve => {
                    resolve('');
                });
            }
            else {
                // Most non-ReSpec specs still follow the ReSpec conventions
                // for IDL definitions
                return extractRespecIdl(doc);
            }
        });
}


/**
 * Extract the IDL definitions from a Bikeshed spec
 *
 * Note Bikeshed summarizes the IDL definitions in an appendix. This is
 * what the code uses.
 *
 * @function
 * @private
 * @param {Document} doc
 * @return {Promise} The promise to get a dump of the IDL definitions
 */
function extractBikeshedIdl(doc) {
    return new Promise((resolve, reject) => {
        var idlHeading = doc.getElementById('idl-index');
        if (idlHeading) {
            var nextEl = idlHeading.nextElementSibling;
            if (nextEl) {
                return resolve(nextEl.textContent);
            }
            reject(new Error("Could not find IDL in IDL index"));
        }
        else {
            // the document may have been generated with "omit idl-index"
            // in which case, we try the simple way
            extractRespecIdl(doc).then(resolve);
        }
    });
}


/**
 * Extract the IDL definitions from a ReSpec spec, and in practice from
 * most other specs as well.
 *
 * The function tries a few patterns from the most common to the least used
 * one and stops as soon at one pattern matches.
 *
 * @function
 * @private
 * @param {Document} doc
 * @return {Promise} The promise to get a dump of the IDL definitions
 */
function extractRespecIdl(doc) {
    return new Promise(resolve => {
        let idlEl = doc.querySelector('#idl-index pre') ||
            doc.querySelector('#chapter-idl pre');  // Used in SVG 2 draft
        if (idlEl) {
            resolve(idlEl.textContent);
        }
        else {
            let idl = '';
            ['pre.idl', 'pre > code.idl-code', 'div.idl-code > pre', 'pre.widl']
                .find(sel => !!(idl += [...doc.querySelectorAll(sel)].map(n => '\n' + n.textContent).join('')));
            resolve(idl);
        }
    });
}


/**************************************************
Export the extract method for use as module
**************************************************/
module.exports.extract = extract;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var url = process.argv[2];
    if (!url) {
        console.error("Required URL parameter missing");
        process.exit(2);
    }
    extract(url)
        .then(idl => {
            console.log(idl);
        })
        .catch(err => {
            console.error(err);
            process.exit(64);
        });
}

