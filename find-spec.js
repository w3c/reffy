const blacklist = require("./blacklist.json");
const {JSDOM} = require("jsdom");

const canonicalize = require('./canonicalize-url').canonicalizeURL;

/**
 * Retrieve the document at the specified location and extract links that
 * match the given DOM selector.
 *
 * @function
 * @private
 */
const extractLinks = (url, selector) =>
    JSDOM.fromURL(url).then(dom =>
        [...dom.window.document.querySelectorAll(selector)]
            .map(a => canonicalize(a.href, {datedToLatest: true})));


/**
 * Filter a list of links to keep only new ones.
 *
 * The function also removes duplicates.
 *
 * @function
 * @private
 */
const filterLinks = (list, known) =>
    list.filter((u, i) =>
        (known.indexOf(u) === -1) && // Not in the list of known specs
        (list.indexOf(u) === i));    // and first time we see that new spec


/**
 * Look at external sites and extract URLs of specs that we do not currenly
 * have in our report, and that we have no a priori reason to ignore.
 */
const findNewSpecs = (knownSpecs) => Promise.all([
    extractLinks("https://platform.html5.org/", "#contentCols dd a:first-child"),
    extractLinks("https://www.w3.org/standards/techs/js", "td h4 a:not([href*=NOTE])")
])
    .then(lists => lists.reduce((a, b) => a.concat(b)))
    .then(list => filterLinks(list, knownSpecs))
    .then(list => list.sort());


/**************************************************
Export the find method for use as module
**************************************************/
module.exports.finNewSpecs = findNewSpecs;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    let resultsPath = process.argv[2];
    let report = [];
    if (resultsPath) {
        try {
            report = require(resultsPath);
        } catch(e) {
            console.error("Impossible to read " + resultsPath + ": " + e);
            process.exit(3);
        }
    }
    else {
        console.warn("No report given, proceeding with blacklist only");
    }
    let specsInReport = report.results
        .map(s => s.versions.map(v => canonicalize(v)))
        .reduce((a, b) => a.concat(b), []); // flatten

    // Final list to which we want to compare URLs of specs we extract from
    // external sites. That list includes specs we already know about, and
    // specs we want to ignore
    let knownSpecs = specsInReport.concat(blacklist);

    findNewSpecs(knownSpecs).then(list => console.log(JSON.stringify(list, null, 2)));
}
