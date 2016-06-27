var jsdom = require('jsdom');

var url = process.argv[2];
if (!url) {
    console.error("Required URL parameter missing");
    process.exit(2);
}

jsdom.env(url, [],
          function(err, window) {
              var generator = window.document.querySelector("meta[name='generator']");
              if (generator && generator.content.match(/bikeshed/i)) {
                  extractBikeshedReferences(window.document);
              } else {
                  console.error("Unrecognized generator of spec for " + url);
                  process.exit(64);
              }
          }
);

function extractBikeshedReferences(doc) {
    var refHeading = doc.getElementById('normative');
    if (!refHeading) {
        console.error("Spec " + url + " is generated with bikeshed but does not have a 'normative' id");
        process.exit(64);
    }
    var referenceList = doc.querySelector("#normative + dl");
    if (!referenceList) {
        console.error("Spec " + url + " is generated with bikeshed but does not have a definition list following the heading with id 'normative'");
        process.exit(64);
    }
    var references = [];
    [].forEach.call(referenceList.querySelectorAll("dt"), function(dt) {
        var ref = {};
        ref.name = dt.textContent.replace(/[\[\] \n]/g, '');
        var desc = dt.nextSibling;
        ref.url = desc.querySelector("a[href]").href;
        references.push(ref);
    });
    console.log(JSON.stringify(references));
}
