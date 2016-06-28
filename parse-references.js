var jsdom = require('jsdom');


function extract(url, cb) {
    jsdom.env(url, [],
              function(err, window) {
                  if (err) return cb(err);
                  var generator = window.document.querySelector("meta[name='generator']");
                  if (generator && generator.content.match(/bikeshed/i)) {
                      extractBikeshedReferences(window.document, cb);
                  } else {
                      cb(new Error("Unrecognized generator of spec for " + url));
                  }
              }
             );
}

function extractBikeshedReferences(doc, cb) {
    var extractReferencesFromList = function(referenceList) {
        return [].map.call(referenceList.querySelectorAll("dt"), function(dt) {
            var ref = {};
            ref.name = dt.textContent.replace(/[\[\] \n]/g, '');
            var desc = dt.nextSibling;
            ref.url = desc.querySelector("a[href]").href;
            return ref;
        });
    };

    var error = null;
    var references = {};
    ['normative', 'informative'].forEach(function(referenceType) {
        if (error) return;
        var refHeading = doc.getElementById(referenceType);
        if (!refHeading) {
            error = new Error("Spec " + url + " is generated with bikeshed but does not have a '" + referenceType  + "' id");
        }
        var referenceList = doc.querySelector("#" + referenceType + " + dl");
        if (!referenceList) {
            error = new Error("Spec " + url + " is generated with bikeshed but does not have a definition list following the heading with id '" + referenceType + "'");
        }
        references[referenceType] = extractReferencesFromList(referenceList);
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
