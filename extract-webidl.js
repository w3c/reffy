var urlOrDom = require('./util').urlOrDom;
var getDocumentAndGenerator = require('./util').getDocumentAndGenerator;


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
    return new Promise(resolve => {
        var idlHeading = doc.getElementById('idl-index');
        if (idlHeading) {
            var nextSibling = idlHeading.nextSibling;
            while(nextSibling && nextSibling.nodeType != 1) {
                nextSibling = nextSibling.nextSibling
            }
            resolve(nextSibling.textContent);
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
        var idl = "";
        ["pre.idl", "pre > code.idl-code", "div.idl-code > pre", "pre.widl"]
            .find(sel => {
                var idlNodes = doc.querySelectorAll(sel);
                for (var i = 0 ; i < idlNodes.length; i++) {
                    idl += "\n" + idlNodes[i].textContent;
                }
                if (idl) {
                    return true;
                }
            });

        resolve(idl);
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

