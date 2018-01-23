/**
 * The references parser takes the URL of a spec as input, loads that spec and
 * extracts the list of normative/informative references that it contains. The
 * parser uses some hardcoded logic to detect the "References" section in specs
 * that depend on the spec generator that may be used by the spec (ReSpec,
 * Bikeshed, Anolis, or nothing).
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
function getExtractionRules({doc, generator}) {
    const extractionRules = {
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
    var nextEl = node.nextElementSibling;
    while(nextEl && nextEl.tagName !== name.toUpperCase()) {
        nextEl = nextEl.nextElementSibling;
    }
    return nextEl;
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

const textMatch = re => n => n.textContent.match(re);

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
        const anchors = [...doc.querySelectorAll("h1, h2, h3")];
        const referenceHeadings = anchors.filter(textMatch(/references/i));
        if (!referenceHeadings.length) {
            return reject(new Error("Could not detect a heading called \"references\" in document"));
        }
        if (referenceHeadings.length > 1) {
            const normative = referenceHeadings.find(textMatch(/normative/i));
            const references = {};
            if (normative) {
                const nList = nextTag(normative, "dl");
                if (nList) {
                    references.normative = parseReferences(nList)[0];
                }
            }
            const informative = referenceHeadings.find(textMatch(/informative/i));
            if (informative) {
                const iList = nextTag(informative, "dl");
                if (iList) {
                    references.informative = parseReferences(iList)[0];
                }
            }
            if (informative || normative) {
                return resolve(references);
            }
        }
        // If there are still multiple reference headings,
        // keep only the last one
        const referenceHeading = referenceHeadings.pop();
        const list = nextTag(referenceHeading, "dl");
        if (!list) {
            return reject(new Error("Could not find a reference list formatted with a dl"));
        }
        const refs = parseReferences(list, { filterInformative: true });
        resolve({
            normative: refs[0],
            informative: refs[1]
        });
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
function extractReferences({doc, rules}) {
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
        const generator = rules.generator || "an unknown generator";

        var error = null;
        const references = {};
        ['normative', 'informative'].forEach(function(referenceType) {
            if (error) return;
            const refHeading = doc.getElementById(rules.sectionId[referenceType]);
            if (!refHeading) {
                if (referenceType === 'informative') {
                    return;
                }
                error = new Error("Spec " + url + " is generated with " + generator + " but does not have a '" + rules.sectionId[referenceType]  + "' id");
                return;
            }
            const referenceList = doc.querySelector(rules.listSelector[referenceType]);
            if (!referenceList) {
                error = new Error("Spec " + url + " is generated with " + generator + " but does not have a definition list following the heading with id '" + rules.id[referenceType] + "'");
                return;
            }
            const refs = parseReferences(referenceList, {
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
