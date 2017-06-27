var urlOrDom = require('./util').urlOrDom;
var getDocumentAndGenerator = require('./util').getDocumentAndGenerator;


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
function extract(url) {
    return urlOrDom(url)
        .then(getDocumentAndGenerator)
        .then(getExtractionRules)
        .then(extractReferences);
}


/**
 * Given a document and the name of the generator used to create it,
 * return the document along with the rules to use to extract references.
 *
 * @function
 * @private
 * @param {Document} doc
 * @param {String} generator The well-known generator used to create the doc,
 *   null if unknown
 * @return {Promise} The promise to get a document and relevant extraction rules
 *   (or null if no rules seem to apply).
 */
function getExtractionRules(data) {
    var doc = data.doc, generator = data.generator;
    var extractionRules = {
        bikeshed: {
            generator: "Bikeshed",
            sectionId: {
                normative: "normative",
                informative: "informative"
            },
            listSelector: {
                normative: "#normative + dl",
                informative: "#informative + dl"
            }
        },
        respec: {
            generator: "ReSpec",
            sectionId: {
                normative: "normative-references",
                informative: "informative-references"
            },
            listSelector: {
                normative: "#normative-references > dl",
                informative: "#informative-references > dl"
            }
        },
        anolis: {
            generator: "Anolis",
            sectionId: {
                normative: "anolis-references"
            },
            listSelector: {
                normative: "#anolis-references > dl"
            }
        },
    };

    return new Promise(function (resolve, reject) {
        var rules = (generator ? extractionRules[generator] : null);
        resolve({doc, rules});
    });
}


/**
 * Skip next siblings until another tag with the given name is found
 *
 * @function
 * @private
 * @param {Node} node The DOM node to use as starting point
 * @param {String} name The sibling name to find
 * @return {Node} The next sibling with the given name, null if not found
 */
function nextTag(node, name) {
    var nextSibling = node.nextSibling;
    while(nextSibling && nextSibling.tagName !== name.toUpperCase()) {
        nextSibling = nextSibling.nextSibling;
    }
    return nextSibling;
}


/**
 * Given a markup definition list, parse and return the list of references
 *
 * @function
 * @param {Node} referenceList The "dl" to parse
 * @param {Object} options Parsing options, set "filterInformative" to put
 *   references flagged as "non-normative" to a separate returned list
 * @return {Array} An array whose first item is the list of references and the
 *   second item the list of "non-normative" references (the second item is only
 *   set when "filterInformative" is set)
 */
function parseReferences(referenceList, options) {
    var defaultRef = [], informativeRef = [];
    options = options || {};
    [].forEach.call(referenceList.querySelectorAll("dt"), function(dt) {
        var ref = {};
        ref.name = dt.textContent.replace(/[\[\] \n]/g, '');
        var desc = nextTag(dt, "dd");
        ref.url = desc.querySelector("a[href]") ? desc.querySelector("a[href]").href : "";
        if (options.filterInformative &&
            desc.textContent.match(/non-normative/i)) {
            return informativeRef.push(ref);
        }
        defaultRef.push(ref);
    });
    return [defaultRef, informativeRef];
};


/**
 * Extract references from generic documents that we could not associate with
 * any particular set of extraction rules.
 *
 * @function
 * @private
 * @param {Document} doc The DOM document to parse
 * @return {Promise} The promise to get a list of references.
 */
function extractReferencesWithoutRules(doc) {
    return new Promise(function (resolve, reject) {
        var anchors = doc.querySelectorAll("h1, h2, h3");
        var referenceHeadings = [].filter.call(anchors, a => a.textContent.match(/references/i));
        if (!referenceHeadings.length) {
            return reject(new Error("Could not detect a heading called \"references\" in document"));
        }
        if (referenceHeadings.length > 1) {
            var normative = referenceHeadings.filter(h => h.textContent.match(/normative/i))[0];
            var references = {};
            if (normative) {
                var nList = nextTag(normative, "dl");
                if (nList) {
                    references.normative = parseReferences(nList)[0];
                }
            }
            var informative = referenceHeadings.filter(h => h.textContent.match(/informative/i))[0];
            if (informative) {
                var iList = nextTag(informative, "dl");
                if (iList) {
                    references.informative = parseReferences(iList)[0];
                }
            }
            if (informative || normative) {
                return resolve(references);
            }
        }
        if (referenceHeadings.length > 1) {
            // Still multiple reference headings, only keep the last one
            referenceHeadings = referenceHeadings.slice(-1);
        }
        if (referenceHeadings.length === 1) {
            var list = nextTag(referenceHeadings[0], "dl");
            if (!list) {
                return reject(new Error("Could not find a reference list formatted with a dl"));
            }
            var refs = parseReferences(list, { filterInformative: true });
            resolve({
                normative: refs[0],
                informative: refs[1]
            });
        }
        else {
            return reject(new Error("Could not detect references in document"));
        }
    });
}


/**
 * Extract references from the given document
 *
 * @function
 * @private
 * @param {Document} doc The DOM document to parse
 * @param {Object} rules Extraction rules to use
 * @return {Promise} The promise to get a list of references.
 */
function extractReferences(data) {
    var doc = data.doc, rules = data.rules;
    if (!rules) {
        return extractReferencesWithoutRules(doc);
    }
    return new Promise(function (resolve, reject) {
        if (!rules.sectionId ||
            !rules.sectionId.normative) {
            return reject(new Error("Extraction rules for references section are incorrect"));
        }
        if (!rules.listSelector ||
            !rules.listSelector.normative) {
            return reject(new Error("Extraction rules for the list of references are incorrect"));
        }
        var generator = rules.generator || "an unknown generator";

        var error = null;
        var references = {};
        ['normative', 'informative'].forEach(function(referenceType) {
            if (error) return;
            var refHeading = doc.getElementById(rules.sectionId[referenceType]);
            if (!refHeading) {
                if (referenceType === 'informative') {
                    return;
                }
                error = new Error("Spec " + url + " is generated with " + generator + " but does not have a '" + rules.sectionId[referenceType]  + "' id");
                return;
            }
            var referenceList = doc.querySelector(rules.listSelector[referenceType]);
            if (!referenceList) {
                error = new Error("Spec " + url + " is generated with " + generator + " but does not have a definition list following the heading with id '" + rules.id[referenceType] + "'");
                return;
            }
            var refs = parseReferences(referenceList, {
                filterInformative: (referenceType === 'normative')
            });
            references[referenceType] = refs[0];
            if (referenceType === "normative") {
                references.informative = refs[1];
            }
        });

        if (error) {
            reject(error);
        }
        else {
            resolve(references);
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
        .then(function (references) {
            console.log(JSON.stringify(references, null, 2));
        })
        .catch(function (err) {
            console.error(err);
            process.exit(64);
        });
}
