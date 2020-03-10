#!/usr/bin/env node
/**
 * The spec finder takes a crawl report as input and checks a couple of sites
 * that list Web specifications to detect new specifications that are not yet
 * part of the crawl and that could perhaps be added.
 *
 * The spec finder can be called directly through:
 *
 * `node find-spec.js [crawl report]`
 *
 * where `crawl report` is the name of the crawl report file to parse.
 *
 * @module finder
 */

const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const blacklist = require("../specs/blacklist.json");
const completeWithShortName = require('../lib/util').completeWithShortName;
const completeWithInfoFromW3CApi = require('../lib/util').completeWithInfoFromW3CApi;
const processSpecification = require('../lib/util').processSpecification;
const canonicalize = require('../lib/canonicalize-url').canonicalizeURL;

/**
 * Retrieve the document at the specified location and extract links that
 * match the given DOM selector.
 *
 * @function
 * @private
 */
async function extractLinks(source, url, selector) {
    const result = await processSpecification(url,
        sel => [...document.querySelectorAll(sel)].map(a => Object.assign({
            title: a.textContent.replace(/\s+/g, ' ').trim(),
            url: window.reffy.canonicalizeUrl(a.href, {datedToLatest: true})
        })), [selector]);
    return result.map(a => Object.assign({ source }, a));
}


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
            // Not in the list of known specs
            (known.indexOf(u.url) === -1) &&

            // and not a level draft if we know the version without level
            (known.indexOf(u.url.replace(/-?[\d\.]*\/$/, '/')) === -1) &&

            // and not a level-less draft if we know about one level
            !known.find(url => u.url === url.replace(/-?[\d\.]*\/$/, '/')) &&

            // and first time we see that new spec
            (list.findIndex(s => s.url === u.url) === i))
        .filter(u => {
            // Only keep CSS ED when we don't have the TR URL
            let shortname = u.url.match(/(?:csswg|fxtf|css-houdini)\.org\/([^\/]*)/);
            return !shortname ||
                !list.find(s => s.url === `https://www.w3.org/TR/${shortname[1]}/`);
        })
        .filter(u => {
            // Filter "old" TR URL for CSS specs when we have a better ED
            // candidate, e.g. drop "css3-exclusions" if we have
            // "css-exclusions-1"
            let shortname = u.url.match(/www\.w3\.org\/TR\/css3-([^\/]*)/);
            return !shortname ||
                !list.find(s => s.url.match(new RegExp('/css-' + shortname[1])));
        });


/**
 * Filter specifications that are informative only in essence, either because
 * they don't contain any normative content or because the group that developed
 * the spec stopped work on the spec and published it as a Note
 */
const filterNotes = list => Promise.all(
        list.map(completeWithShortName).map(completeWithInfoFromW3CApi))
    .then(res => res.filter(spec => !spec.informative));


/**
 * Look at external sites and extract URLs of specs that we do not currenly
 * have in our report, and that we have no a priori reason to ignore.
 */
const findNewSpecs = (knownSpecs) => Promise.all([
    extractLinks("platform.html5.org", "https://platform.html5.org/", "#contentCols dd a:first-child"),
    extractLinks("W3C TR (JS)", "https://www.w3.org/standards/techs/js", "td h4 a:not([href*=NOTE])"),
    extractLinks("W3C TR (CSS)", "https://www.w3.org/standards/techs/css", "td h4 a:not([href*=NOTE])"),
    extractLinks("W3C CSS", "https://www.w3.org/Style/CSS/specs", "h2 a[href]"),
    extractLinks("CSS drafts", "https://drafts.csswg.org/", "#spec_table td:first-child a[href]"),
    extractLinks("FXTF drafts", "https://drafts.fxtf.org/", "#spec_table td:first-child a[href]"),
    extractLinks("Houdini drafts", "https://drafts.css-houdini.org/", "#spec_table td:first-child a[href]")
])
    .then(lists => lists.reduce((a, b) => a.concat(b)))
    .then(filterNotes)
    .then(list => filterLinks(list, knownSpecs))
    .then(list => list.sort((a, b) => {
        if (a.title < b.title) {
            return -1;
        }
        else if (a.title > b.title) {
            return 1;
        }
        else {
            return 0;
        }
    }));


/**************************************************
Export the find method for use as module
**************************************************/
module.exports.finNewSpecs = findNewSpecs;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    let resultsPath = process.argv[2];
    let report = {};
    if (resultsPath) {
        try {
            report = requireFromWorkingDirectory(resultsPath);
        } catch(e) {
            console.error("Impossible to read " + resultsPath + ": " + e);
            process.exit(3);
        }
    }
    else {
        console.warn("No report given, proceeding with blacklist only");
        report.results = [];
    }
    let specsInReport = report.results
        .map(s => s.versions.map(v => canonicalize(v)))
        .reduce((a, b) => a.concat(b), []); // flatten

    // Final list to which we want to compare URLs of specs we extract from
    // external sites. That list includes specs we already know about, and
    // specs we want to ignore
    let knownSpecs = specsInReport.concat(blacklist);

    findNewSpecs(knownSpecs).then(list => {
        console.log(JSON.stringify(list.map(s => Object.assign({ source: s.source, url: s.url, title: s.title })), null, 2));
        console.log(`=> ${list.length} new specs found`);
    });
}
