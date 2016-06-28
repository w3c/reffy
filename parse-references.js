var jsdom = require('jsdom');

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

function extract(url, cb) {
    jsdom.env({
        url: url,
        features: {
            FetchExternalResources: ['script'],
            ProcessExternalResources: ['script'],
            // only load respec, to avoid jsdom bugs
            SkipExternalResources: /^((?!respec).)*$/
        },
        done: function(err, window) {
            if (err) return cb(err);
            var generator = window.document.querySelector("meta[name='generator']");
            if (generator && generator.content.match(/bikeshed/i)) {
                extractSimpleReferences(window.document, extractionRules.bikeshed, cb);
            } else if (window.document.body.id === "respecDocument") {
                extractSimpleReferences(window.document, extractionRules.respec, cb);
            } else if (window.respecConfig) {
                if (!window.respecConfig.postProcess) {
                    window.respecConfig.postProcess = [];
                }
                window.respecConfig.postProcess.push(function() {
                    extractSimpleReferences(window.document, extractionRules.respec, cb);
                });
            } else if (window.document.getElementById('anolis-references')) {
                extractSimpleReferences(window.document, extractionRules.anolis, cb);
            } else {
                extractGenericReferences(window.document, cb);
            }
        }
    });
}

function nextTag(node, name) {
    var nextSibling = node.nextSibling;
    while(nextSibling && nextSibling.tagName !== name.toUpperCase()) {
        nextSibling = nextSibling.nextSibling;
    }
    return nextSibling;
}

function extractReferencesFromList(referenceList, type) {
    var defaultRef = [], informativeRef = [];
    [].forEach.call(referenceList.querySelectorAll("dt"), function(dt) {
        var ref = {};
        ref.name = dt.textContent.replace(/[\[\] \n]/g, '');
        var desc = nextTag(dt, "dd");
        ref.url = desc.querySelector("a[href]") ? desc.querySelector("a[href]").href : "";
        if (desc.textContent.match(/non-normative/i) && type === "normative") {
            return informativeRef.push(ref);
        }
        defaultRef.push(ref);
    });
    return [defaultRef, informativeRef];
};

function extractGenericReferences(doc, cb) {
    var anchors = doc.querySelectorAll("h1, h2, h3");
    var referenceHeadings = [].filter.call(anchors, a => a.textContent.match(/references/i));
    if (!referenceHeadings.length) {
        return cb(new Error("Could not detect a heading called \"references\" in document"));
    }
    if (referenceHeadings.length === 1) {
        var list = nextTag(referenceHeadings[0], "dl");
        if (!list) {
            return cb(new Error("Could not find a reference list formatted with a dl"));
        }
        var refs = extractReferencesFromList(list, "normative");
        return cb(null, {normative: refs[0], informative: refs[1]});
    } else {
        var normative = referenceHeadings.filter(h => h.textContent.match(/normative/i))[0];
        var references = {};
        if (normative) {
            var nList = nextTag(normative, "dl");
            if (nList) {
                references.normative = extractReferencesFromList(nList)[0];
            }
        }
        var informative = referenceHeadings.filter(h => h.textContent.match(/informative/i))[0];
        if (informative) {
            var iList = nextTag(informative, "dl");
            if (iList) {
                references.informative = extractReferencesFromList(iList)[0];
            }
        }
        if (!informative && !normative) {
            return cb(new Error("Could not detect references in document"));
        }
        cb(null, references);
    }
}

function extractSimpleReferences(doc, rules, cb) {
    if (!rules) {
        return cb(new Error("No extraction rules specified"));
    }
    if (!rules.sectionId ||
        !rules.sectionId.normative) {
        return cb(new Error("Extraction rules for references section are incorrect"));
    }
    if (!rules.listSelector ||
        !rules.listSelector.normative) {
        return cb(new Error("Extraction rules for the list of references are incorrect"));
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
        var refs = extractReferencesFromList(referenceList, "normative");
        references[referenceType] = refs[0];
        if (referenceType === "normative") {
            references.informative = refs[1];
        }
    });

    if (error) {
        return cb(error);
    }
    else {
        cb(null, references);
    }
}

module.exports.extract = extract;

if (require.main === module) {
    var url = process.argv[2];
    if (!url) {
        console.error("Required URL parameter missing");
        process.exit(2);
    }
    extract(url, function(err, references) {
        if (err) {
            console.error(err);
            process.exit(64);
        }
        console.log(JSON.stringify(references, null, 2));
    });
}
