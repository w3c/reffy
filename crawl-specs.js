var refParser = require('./parse-references');
var webidlExtractor = require('./extract-webidl');
var webidlParser = require('./parse-webidl');

function crawlList(speclist) {
    function getRefAndIdl(url) {
        return Promise.all([
            url,
            refParser.extract(url).catch(err => err),
            webidlExtractor.extract(url).then(idl => webidlParser.parse(idl)).catch(err => err)
                ]).then(res => { return { url: res[0], refs: res[1], idl: res[2]};});
    }

    return Promise.all(speclist.map(getRefAndIdl));
}

/**************************************************
Export the crawlList method for use as module
**************************************************/
module.exports.crawlList = crawlList;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var speclistPath = process.argv[2];
    if (!speclistPath) {
        console.error("Required filename parameter missing");
        process.exit(2);
    }
    var speclist;
    try {
        speclist = require(speclistPath);
    } catch(e) {
        console.error("Impossible to read " + speclistPath + ": " + e);
        process.exit(3);
    }
    crawlList(speclist)
        .then(function (data) {
            console.log(JSON.stringify(data, null, 2));
        })
        .catch(function (err) {
            console.error(err);
            process.exit(64);
        });
}
