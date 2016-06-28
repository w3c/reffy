var jsdom = require('jsdom');

function extract(url, cb) {
    jsdom.env({
        url: url,
        features: {
            FetchExternalResources: ['script'],
            ProcessExternalResources: ['script']
        },
        done: function(err, window) {
            if (err) return cb(err);
            var generator = window.document.querySelector("meta[name='generator']");
            if (generator && generator.content.match(/bikeshed/i)) {
                extractBikeshedIdl(window.document, cb);
            } else if (window.document.getElementById('respecDocument')) {
                extractRespecIdl(window.document, cb);
            } else if (window.respecConfig) {
                if (!window.respecConfig.postProcess) {
                    window.respecConfig.postProcess = [];
                }
                window.respecConfig.postProcess.push(function() {
                    extractRespecIdl(window.document, cb);
                });
            } else {
                cb(new Error("Unrecognized generator of spec for " + url));
            }
        }
    });
}

function extractBikeshedIdl(doc, cb) {
    var idlHeading = doc.getElementById('idl-index');
    if (idlHeading) {
        var nextSibling = idlHeading.nextSibling;
        while(nextSibling && nextSibling.nodeType != 1) {
            nextSibling = nextSibling.nextSibling
        }
        return cb(null, nextSibling.textContent);
    }
    return cb(null, "");
}

function extractRespecIdl(doc, cb) {
    var idlNodes = doc.querySelectorAll("pre.idl");
    var idl = "";
    for (var i = 0 ; i < idlNodes.length; i++) {
        idl += "\n" + idlNodes[i].textContent;
    }
    cb(null, idl);
}

module.exports.extract = extract;

if (require.main === module) {
    var url = process.argv[2];
    if (!url) {
        console.error("Required URL parameter missing");
        process.exit(2);
    }
    extract(url, function(err, idl) {
        if (err) {
            console.error(err);
            process.exit(64);
        }
        console.log(idl);
    });
}

