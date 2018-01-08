const canonicalizeURL = require('./canonicalize-url').canonicalizeURL;
const canonicalizesTo = require('./canonicalize-url').canonicalizesTo;
const fetch = require('./util').fetch;

const array_concat = (a,b) => a.concat(b);

/**
 * Helper function that returns true when the given URL seems to target a real
 * "spec" (as opposed to, say, a Wiki page, or something else)
 */
const matchSpecUrl = url => url.match(/spec.whatwg.org/) || url.match(/www.w3.org\/TR\/[a-z0-9]/) || (url.match(/w3c.github.io/) && ! url.match(/w3c.github.io\/test-results\//));


/**
 * Compares specs for ordering by title
 */
const byTitle = (a, b) => a.title.toUpperCase().localeCompare(b.title.toUpperCase());


/**
 * Returns true when two arrays are equal
 */
const arrayEquals = (a, b, prop) =>
    (a.length === b.length) &&
    a.every(item => !!(prop ? b.find(i => i[prop] === item[prop]) : b.find(i => i === item)));

/**
 * Options for date formatting
 */
const dateOptions = {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
};


/**
 * Analyze the result of a crawl and produce a report that can easily be
 * converted without more processing to a human readable version.
 *
 * @function
 * @param {Array(Object)} A crawl result, one entry per spec
 * @return {Array(Object)} A report, one entry per spec, each spec will have
 *   a "report" property with "interesting" properties, see code comments inline
 *   for details
 */
function processReport(results) {
    var knownIdlNames = results
        .map(r => r.idl && r.idl.idlNames ? Object.keys(r.idl.idlNames).filter(n => (n !== '_dependencies') && (n !== '_reallyDependsOnWindow')) : [], [])
        .reduce(array_concat);
    var idlNamesIndex = {};
    knownIdlNames.forEach(name => {
        idlNamesIndex[name] = results.filter(spec => {
            return spec.idl &&
                spec.idl.idlNames &&
                spec.idl.idlNames[name];
        });
    });

    // TODO: we may end up with different variants of the WebIDL spec
    var WebIDLSpec = results.find(spec => (spec.shortname === 'WebIDL-1')) || {};

    var sortedResults = results.sort(byTitle);

    // Construct spec equivalence from the crawl report, which should be more
    // complete than the initial equivalence list.
    var specEquivalents = {};
    sortedResults.forEach(spec =>
        spec.versions.forEach(v => {
            if (specEquivalents[v]) {
                if (Array.isArray(specEquivalents[v])) {
                    specEquivalents[v].push(spec.url);
                }
                else {
                    specEquivalents[v] = [specEquivalents[v], spec.url];
                }
            }
            else {
                specEquivalents[v] = spec.url;
            }
        }
    ));

    // Strong canonicalization options to find references
    var useEquivalents = {
        datedToLatest: true,
        equivalents: specEquivalents
    };

    return sortedResults
        .map(spec => {
            var idlDfns = (spec.idl && spec.idl.idlNames) ?
                Object.keys(spec.idl.idlNames).filter(name => (name !== '_dependencies') && (name !== '_reallyDependsOnWindow')) : [];
            var idlDeps = (spec.idl && spec.idl.externalDependencies) ?
                spec.idl.externalDependencies : [];
            var reallyDependsOnWindow = (spec.idl && spec.idl.idlNames) ?
                spec.idl.idlNames._reallyDependsOnWindow : false;

            var report = {
                // An error at this level means the spec could not be parsed at all
                error: spec.error,

                // Whether the crawler found normative references
                // (most specs should have)
                noNormativeRefs: !spec.refs.normative ||
                    (spec.refs.normative.length === 0),

                // Whether the spec normatively references the WebIDL spec
                // (all specs that define IDL content should)
                noRefToWebIDL: !((spec === WebIDLSpec) ||
                    (spec.refs.normative && spec.refs.normative.find(ref =>
                        ref.name.match(/^WebIDL/i) ||
                            (ref.url === WebIDLSpec.url) ||
                            (ref.url === WebIDLSpec.latest)))),

                // Whether the crawler managed to find IDL content in the spec
                // (most specs crawled here should)
                noIdlContent: (Object.keys(spec.idl).length === 0) ||
                    (!spec.idl.idlNames && !spec.idl.message) ||
                    (spec.idl.idlNames &&
                        (Object.keys(spec.idl.idlNames).length === 1) &&
                        (Object.keys(spec.idl.idlExtendedNames).length === 0)),

                // Whether the spec has invalid IDL content
                // (the crawler cannot do much when IDL content is invalid, it
                // cannot tell what IDL definitions and references the spec
                // contains in particular)
                hasInvalidIdl: !!(!spec.idl.idlNames && spec.idl.message),

                // Whether the spec uses IDL constructs that were valid in
                // WebIDL Level 1 but no longer are, typically "[]" instead of
                // "FrozenArray"
                hasObsoleteIdl: spec.idl.hasObsoleteIdl,

                // List of IDL names used in the spec that we know nothing about
                // (for instance because of some typo or because the term is
                // defined in a spec that has not been crawled or that could
                // not be parsed)
                unknownIdlNames: idlDeps
                    .filter(name => knownIdlNames.indexOf(name) === -1)
                    .sort(),

                // List of IDL definitions that are already defined in some
                // other crawled spec
                // (this should not happen, ideally)
                redefinedIdlNames: idlDfns
                    .filter(name => (idlNamesIndex[name].length > 1))
                    .map(name => {
                        return {
                            name,
                            refs: idlNamesIndex[name].filter(ref => (ref.url !== spec.url))
                        };
                    }),

                // List of IDL names used in the spec that are defined in some
                // other spec, and which do not seem to appear in the list of
                // normative references
                // (There should always be an entry in the normative list of
                // references that links to that other spec)
                // NB: "Exposed=Window", which would in theory trigger the need
                // to add a normative reference to HTML, is considered to be
                // an exception to the rule, and ignored.
                missingWebIdlRef: idlDeps
                    .filter(name => knownIdlNames.indexOf(name) !== -1)
                    .filter(name => reallyDependsOnWindow || (name !== 'Window'))
                    .map(name => {
                        var refs = idlNamesIndex[name];
                        var ref = null;
                        if (spec.refs && spec.refs.normative) {
                            ref = refs.find(s => !!spec.refs.normative.find(r =>
                                canonicalizesTo(r.url, s.url, useEquivalents)));
                        }
                        return (ref ? null : {
                            name,
                            refs
                        });
                    })
                    .filter(i => !!i),

                // Links to external specifications within the body of the spec
                // that do not have a corresponding entry in the references
                // (all links to external specs should have a companion ref)
                missingLinkRef: spec.links
                    .filter(matchSpecUrl)
                    .filter(l => {
                        // Filter out "good" and "inconsistent" references
                        let canon = canonicalizeURL(l, useEquivalents);
                        let refs = (spec.refs.normative || []).concat(spec.refs.informative || []);
                        return !refs.find(r => canonicalizesTo(r.url, canon, useEquivalents));
                    })
                    .filter(l =>
                        // Ignore links to other versions of "self". There may
                        // be cases where it would be worth reporting them but
                        // most of the time they appear in "changelog" sections.
                        !canonicalizesTo(l, spec.url, useEquivalents) &&
                        !canonicalizesTo(l, spec.versions, useEquivalents)
                    ),

                // Links to external specifications within the body of the spec
                // that have a corresponding entry in the references, but for
                // which the reference uses a different URL, e.g. because the
                // link targets the Editor's Draft, whereas the reference
                // targets the latest published version
                inconsistentRef: spec.links
                    .filter(matchSpecUrl)
                    .map(l => {
                        let canonSimple = canonicalizeURL(l);
                        let canon = canonicalizeURL(l, useEquivalents);
                        let refs = (spec.refs.normative || []).concat(spec.refs.informative || []);

                        // Filter out "good" references
                        if (refs.find(r => canonicalizesTo(r.url, canonSimple))) {
                            return null;
                        }
                        let ref = refs.find(r => canonicalizesTo(r.url, canon, useEquivalents));
                        return (ref ? { link: l, ref } : null);
                    })
                    .filter(l => !!l),

                // Lists of specs present in the crawl report that reference
                // the current spec, either normatively or informatively
                // (used to produce the dependencies report)
                referencedBy: {
                    normative: sortedResults.filter(s =>
                        s.refs.normative && s.refs.normative.find(r =>
                            canonicalizesTo(r.url, spec.url, useEquivalents) ||
                            canonicalizesTo(r.url, spec.versions, useEquivalents))),
                    informative: sortedResults.filter(s =>
                        s.refs.informative && s.refs.informative.find(r =>
                            canonicalizesTo(r.url, spec.url, useEquivalents) ||
                            canonicalizesTo(r.url, spec.versions, useEquivalents)))
                }
            };

            // A spec is OK if it does not contain anything "suspicious".
            report.ok = !report.error &&
                !report.noNormativeRefs &&
                !report.noIdlContent &&
                !report.hasInvalidIdl &&
                !report.hasObsoleteIdl &&
                !report.noRefToWebIDL &&
                (!report.unknownIdlNames || (report.unknownIdlNames.length === 0)) &&
                (!report.redefinedIdlNames || (report.redefinedIdlNames.length === 0)) &&
                (!report.missingWebIdlRef || (report.missingWebIdlRef.length === 0)) &&
                (report.missingLinkRef.length === 0) &&
                (report.inconsistentRef.length === 0);
            var res = {
                title: spec.title,
                shortname: spec.shortname,
                date: spec.date,
                url: spec.url,
                latest: spec.latest,
                datedUrl: spec.datedUrl,
                datedStatus: spec.datedStatus,
                edDraft: spec.edDraft,
                crawled: spec.crawled,
                repository: spec.repository,
                report
            };
            return res;
        });
}


/**
 * Helper function that outputs a generic "about" header to help readers
 * understand what the report contains.
 *
 * @function
 */
function writeGenericInfo() {
    var w = console.log.bind(console);

    w('Reffy is a spec exploration tool.' +
        ' It takes a list of specifications as input, fetches and parses the latest Editor\'s Draft' +
        ' of each of these specifications to study the IDL content that it defines, the links that it' +
        ' contains, and the normative and informative references that it lists.');
    w();
    w('Reffy only knows facts about specifications that it crawled. Some of the anomalies reported in' +
        ' this report may be false positives as a result, triggered by the fact that Reffy has a very' +
        ' narrow view of the spec-verse.');
    w();
    w('Some anomalies may also be triggered by temporary errors in the Editor\'s Drafts of the' +
        ' specifications that were crawled such as invalid Web IDL definitions.');
}


/**
 * Helper function that outputs main crawl info about a spec
 *
 * @function
 */
function writeCrawlInfo(spec, withHeader) {
    const w = console.log.bind(console);

    if (withHeader) {
        w('### Spec info {.info}');
    }
    else  {
        w('Spec info:');
    }
    w();

    let crawledVersion = 'Initial URL';
    if ((spec.crawled === spec.datedUrl) || (spec.crawled === spec.latest)) {
        crawledVersion = 'Latest published version';
    }
    else if (spec.crawled === spec.edDraft) {
        crawledVersion = 'Editor\'s Draft';
    }
    else if (spec.crawled.indexOf('spec.whatwg.org') !== -1) {
        crawledVersion = 'Living Standard';
    }
    w('- Crawled version: [' + crawledVersion + '](' + spec.crawled + ')' +
        (spec.date ? ' (' + spec.date + ')' : ''));
    if (spec.edDraft) {
        w('- Editor\'s Draft: [' + spec.edDraft + '](' + spec.edDraft + ')');
    }
    if (spec.latest) {
        w('- Latest published version: [' + spec.latest + '](' + spec.latest + ')');
    }
    if (spec.datedUrl && spec.datedStatus) {
        w('- Latest published status: [' + spec.datedStatus + '](' + spec.datedUrl + ')');
    }
    if (spec.repository) {
        let githubcom = spec.repository.match(/^https:\/\/github.com\/([^\/]*)\/([^\/]*)/);
        let repositoryName = spec.repository;
        if (githubcom) {
            repositoryName = 'GitHub ' + githubcom[1] + '/' + githubcom[2];
        }
        w('- Repository: [' + repositoryName + '](' + spec.repository + ')');
    }
    w('- Shortname: ' + (spec.shortname || 'no shortname'));
}


function writeDependenciesInfo(spec, results, withHeader) {
    const w = console.log.bind(console);

    if (withHeader) {
        w('### Known dependencies on this specification {.dependencies}');
        w();
    }

    if (spec.report.referencedBy.normative.length > 0) {
        w('Normative references to this spec from:');
        w();
        spec.report.referencedBy.normative.forEach(s => {
            w('- [' + s.title + '](' + s.crawled + ')');
        });
    }
    else {
        w('No normative reference to this spec from other specs.');
    }
    w();

    // Check the list of specifications that should normatively reference
    // this specification because they use IDL content it defines.
    let shouldBeReferencedBy = results.filter(s =>
        s.report.missingWebIdlRef &&
        s.report.missingWebIdlRef.find(i =>
            i.refs.find(ref => (ref.url === spec.url))));
    if (shouldBeReferencedBy.length > 0) {
        w('Although they do not, the following specs should also normatively' +
            ' reference this spec because they use IDL terms it defines:');
        w();
        shouldBeReferencedBy.forEach(s => {
            w('- [' + s.title + '](' + s.crawled + ')');
        });
        w();
    }

    if (spec.report.referencedBy.informative.length > 0) {
        w('Informative references to this spec from:');
        w();
        spec.report.referencedBy.informative.forEach(s => {
            w('- [' + s.title + '](' + s.crawled + ')');
        });
    }
    else {
        w('No informative reference to this spec from other specs.');
    }
}

/**
 * Outputs a human-readable Markdown anomaly report from a crawl report,
 * with one entry per spec.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateReportPerSpec(crawlResults) {
    var count = 0;
    var w = console.log.bind(console);

    // Compute report information
    const results = processReport(crawlResults.results);

    w('% ' + (crawlResults.title || 'Reffy crawl results'));
    w('% Reffy');
    w('% ' + (new Date(crawlResults.date)).toLocaleDateString('en-US', dateOptions));
    w();

    results.forEach(spec => {
        // Prepare anomaly flags
        let flags = ['spec'];
        if (spec.report.error) {
            flags.push('error');
        }
        else {
            if (!spec.report.ok) {
                flags.push('anomaly');
            }
            flags = flags.concat(Object.keys(spec.report)
                .filter(anomaly => (anomaly !== 'referencedBy'))
                .filter(anomaly => (Array.isArray(spec.report[anomaly]) ?
                    (spec.report[anomaly].length > 0) :
                    !!spec.report[anomaly])));
        }
        let attr = flags.reduce((res, anomaly) =>
            res + (res ? ' ' : '') + 'data-' + anomaly + '=true', '');

        w('## ' + spec.title + ' {' + attr + '}');
        w();
        writeCrawlInfo(spec, true);
        w();

        const report = spec.report;
        w('### Potential issue(s) {.anomalies}');
        w();
        if (report.ok) {
            w('This specification looks good!');
        }
        else if (report.error) {
            w('The following network or parsing error occurred:');
            w('`' + report.error + '`');
            w();
            w('Reffy could not render this specification as a DOM tree and' +
                ' cannot say anything about it as a result. In particular,' +
                ' it cannot include content defined in this specification' +
                ' in the analysis of other specifications crawled in this' +
                ' report.');
        }
        else {
            if (report.noNormativeRefs) {
                w('- No normative references found');
            }
            if (report.noIdlContent) {
                w('- No WebIDL definitions found');
            }
            if (report.hasInvalidIdl) {
                w('- Invalid WebIDL content found');
            }
            if (report.hasObsoleteIdl) {
                w('- Obsolete WebIDL constructs found');
            }
            if (!report.noIdlContent && report.noRefToWebIDL) {
                w('- Spec uses WebIDL but does not reference it normatively');
            }
            if (report.unknownIdlNames &&
                (report.unknownIdlNames.length > 0)) {
                w('- Unknown WebIDL names used: ' +
                    report.unknownIdlNames.map(name => '`' + name + '`').join(', '));
            }
            if (report.redefinedIdlNames &&
                (report.redefinedIdlNames.length > 0)) {
                w('- WebIDL names also defined elsewhere: ');
                report.redefinedIdlNames.map(i => {
                    w('    * `' + i.name + '` also defined in ' +
                        i.refs.map(ref => ('[' + ref.title + '](' + ref.crawled + ')')).join(' and '));
                });
            }
            if (report.missingWebIdlRef &&
                (report.missingWebIdlRef.length > 0)) {
                w('- Missing references for WebIDL names: ');
                report.missingWebIdlRef.map(i => {
                    w('     * `' + i.name + '` defined in ' +
                        i.refs.map(ref => ('[' + ref.title + '](' + ref.crawled + ')')).join(' or '));
                });
            }
            if (report.missingLinkRef &&
                (report.missingLinkRef.length > 0)) {
                w('- Missing references for links: ');
                report.missingLinkRef.map(l => {
                    w('     * [`' + l + '`](' + l + ')');
                });
            }
            if (report.inconsistentRef &&
                (report.inconsistentRef.length > 0)) {
                w('- Inconsistent references for links: ');
                report.inconsistentRef.map(l => {
                    w('     * [`' + l.link + '`](' + l.link + '), related reference "' + l.ref.name + '" uses URL [`' + l.ref.url + '`](' + l.ref.url + ')');
                });
            }
        }
        w();
        writeDependenciesInfo(spec, results, true);
        w();
        w();
    });
    w();
    w();
}


/**
 * Outputs a human-readable Markdown anomaly report from a crawl report,
 * sorted by type of anomaly.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateReportPerIssue(crawlResults) {
    var count = 0;
    var w = console.log.bind(console);

    // Compute report information
    let results = processReport(crawlResults.results);

    w('% ' + (crawlResults.title || 'Reffy crawl results'));
    w('% Reffy');
    w('% ' + (new Date(crawlResults.date)).toLocaleDateString('en-US', dateOptions));
    w();

    count = results.length;
    w('' + count + ' specification' + ((count > 1) ? 's' : '') + ' were crawled in this report.');
    w();
    w();

    let parsingErrors = results.filter(spec => spec.report.error);
    if (parsingErrors.length > 0) {
        w('## Specifications that could not be rendered');
        w();
        w('Reffy could not fetch or render these specifications for some reason.' +
            ' This may happen when a network error occurred or when a specification' +
            ' uses an old version of ReSpec.');
        w();
        count = 0;
        parsingErrors.forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + '): `' + spec.report.error + '`');
        });
        w();
        w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
        w();
        w();

        // Remove specs that could not be parsed from the rest of the report
        results = results.filter(spec => !spec.report.error);
    }

    count = 0;
    w('## Specifications without normative dependencies');
    w();
    results
        .filter(spec => spec.report.noNormativeRefs)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('Basically all specifications have normative dependencies on some other' +
            ' specification. Reffy could not find any normative dependencies for the' +
            ' specifications mentioned above, which seems strange.');
    }
    w();
    w();

    count = 0;
    w('## Specifications without WebIDL definitions');
    w();
    results
        .filter(spec => spec.report.noIdlContent)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('Not all specifications define IDL content, presence in this list' +
            ' may be completely normal. Reffy\'s current focus is on IDL' +
            ' specifications, the number of specifications listed here' +
            ' should remain minimal.');
    }
    w();
    w();

    count = 0;
    w('## List of specifications with invalid WebIDL content');
    w();
    results
        .filter(spec => spec.report.hasInvalidIdl)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('WebIDL continues to evolve. Reffy may incorrectly report as invalid' +
            ' perfectly valid WebIDL content if the specification uses bleeding-edge' +
            ' WebIDL features');
    }
    w();
    w();

    count = 0;
    w('## List of specifications with obsolete WebIDL constructs');
    w();
    results
        .filter(spec => spec.report.hasObsoleteIdl)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('A typical example is the use of `[]` instead of `FrozenArray`.');
    }
    w();
    w();

    count = 0;
    w('## Specifications that use WebIDL but do not reference the WebIDL spec');
    w();
    results.forEach(spec => {
        if (!spec.report.noIdlContent && spec.report.noRefToWebIDL) {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        }
    });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        ('All specifications that define WebIDL content should have a ' +
            ' **normative** reference to the WebIDL specification. ' +
            ' Some specifications listed here may reference the WebIDL' +
            ' specification informatively, but that is not enough!');
    }
    w();
    w();


    count = 0;
    w('## List of WebIDL names not defined in the specifications crawled');
    w();
    var idlNames = {};
    results.forEach(spec => {
        if (!spec.report.unknownIdlNames ||
            (spec.report.unknownIdlNames.length === 0)) {
            return;
        }
        spec.report.unknownIdlNames.forEach(name => {
            if (!idlNames[name]) {
                idlNames[name] = [];
            }
            idlNames[name].push(spec);
        });
    });
    Object.keys(idlNames).sort().forEach(name => {
        count += 1;
        w('- `' + name + '` used in ' +
            idlNames[name].map(ref => ('[' + ref.title + '](' + ref.crawled + ')')).join(', '));
    });
    w();
    w('=> ' + count + ' WebIDL name' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('Some of them may be type errors in specs (e.g. "int" does not exist, "Array" cannot be used on its own, etc.)');
        w('Also, please keep in mind that Reffy only knows about IDL terms defined in the' +
            ' specifications that were crawled **and** that do not have invalid IDL content.');
    }
    w();
    w();

    count = 0;
    w('## List of WebIDL names defined in more than one spec');
    w();
    idlNames = {};
    results.forEach(spec => {
        if (!spec.report.redefinedIdlNames ||
            (spec.report.redefinedIdlNames.length === 0)) {
            return;
        }
        spec.report.redefinedIdlNames.forEach(i => {
            if (!idlNames[i.name]) {
                idlNames[i.name] = [];
            }
            idlNames[i.name].push(spec);
        });
    });
    Object.keys(idlNames).sort().forEach(name => {
        count += 1;
        w('- `' + name + '` defined in ' +
            idlNames[name].map(ref => ('[' + ref.title + '](' + ref.crawled + ')')).join(' and '));
    });
    w();
    w('=> ' + count + ' WebIDL name' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('"There can be only one"...');
    }
    w();
    w();

    count = 0;
    var countrefs = 0;
    w('## Missing references for WebIDL names');
    w();
    results.forEach(spec => {
        if (spec.report.missingWebIdlRef &&
            (spec.report.missingWebIdlRef.length > 0)) {
            count += 1;
            if (spec.report.missingWebIdlRef.length === 1) {
                countrefs += 1;
                let i = spec.report.missingWebIdlRef[0];
                w('- [' + spec.title + '](' + spec.crawled + ')' +
                    ' uses `' + i.name + '` but does not reference ' +
                    i.refs.map(ref => ('[' + ref.title + '](' + ref.crawled + ')')).join(' or '));
            }
            else {
                w('- [' + spec.title + '](' + spec.crawled + ') uses:');
                spec.report.missingWebIdlRef.map(i => {
                    countrefs += 1;
                    w('    * `' + i.name + '` but does not reference ' +
                        i.refs.map(ref => ('[' + ref.title + '](' + ref.crawled + ')')).join(' or '));
                });
            }
        }
    });
    w();
    w('=> ' + countrefs + ' missing reference' + ((countrefs > 1) ? 's' : '') +
      ' for IDL definitions found in ' + count + ' specification' +
      ((count > 1) ? 's' : ''));
    w();
    w();

    count = 0;
    countrefs = 0;
    w('## Missing references based on document links');
    w();
    results.forEach(spec => {
        if (spec.report.missingLinkRef &&
            (spec.report.missingLinkRef.length > 0)) {
            count += 1;
            if (spec.report.missingLinkRef.length === 1) {
                countrefs += 1;
                let l = spec.report.missingLinkRef[0];
                w('- [' + spec.title + '](' + spec.crawled + ')' +
                  ' links to [`' + l + '`](' + l + ') but does not list it' +
                  ' in its references');
            }
            else {
                w('- [' + spec.title + '](' + spec.crawled + ') links to:');
                spec.report.missingLinkRef.forEach(l => {
                    countrefs++;
                    w('    * [`' + l + '`](' + l + ') but does not list it ' +
                      'in its references');
                });
            }
        }
    });
    w();
    w('=> ' + countrefs + ' missing reference' + ((countrefs > 1) ? 's' : '') +
      ' for links found in ' + count + ' specification' +
      ((count > 1) ? 's' : ''));
    if (count > 0) {
        w();
        w('Any link to an external document from within a specification should' +
            ' trigger the creation of a corresponding entry in the references' +
            ' section.');
        w();
        w('Note Reffy only reports on links to "well-known" specs and ignores' +
            ' links to non-usual specs (e.g. PDF documents, etc.) for now.');
    }
    w();
    w();

    count = 0;
    countrefs = 0;
    w('## Reference URL is inconsistent with URL used in document links');
    w();
    results.forEach(spec => {
        if (spec.report.inconsistentRef &&
            (spec.report.inconsistentRef.length > 0)) {
            count += 1;
            if (spec.report.inconsistentRef.length === 1) {
                countrefs += 1;
                let l = spec.report.inconsistentRef[0];
                w('- [' + spec.title + '](' + spec.crawled + ')' +
                  ' links to [`' + l.link + '`](' + l.link + ') but related reference "' + l.ref.name + '" uses URL [`' + l.ref.url + '`](' + l.ref.url + ')');
            }
            else {
                w('- [' + spec.title + '](' + spec.crawled + ') links to:');
                spec.report.inconsistentRef.forEach(l => {
                    countrefs++;
                    w('    * [`' + l.link + '`](' + l.link + ') but related reference "' + l.ref.name + '" uses URL [`' + l.ref.url + '`](' + l.ref.url + ')');
                });
            }
        }
    });
    w();
    w('=> ' + countrefs + ' inconsistent reference' + ((countrefs > 1) ? 's' : '') +
      ' for links found in ' + count + ' specification' +
      ((count > 1) ? 's' : ''));
    if (count > 0) {
        w();
        w('Links in the body of a specification should be to the same document' +
            ' as that pointed to by the related reference in the References section.' +
            ' The specifications reported here use a different URL. For instance,' +
            ' they may use a link to the Editor\'s Draft but target the latest' +
            ' published version in the References section.' +
            ' There should be some consistency across the specification.');
    }

}


/**
 * Outputs a human-readable Markdown dependencies report from a crawl report,
 * one entry per spec.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateDependenciesReport(crawlResults) {
    var count = 0;
    var w = console.log.bind(console);

    // Compute report information
    const results = processReport(crawlResults.results);

    w('# Reffy dependencies report');
    w();
    w('Reffy is a spec exploration tool.' +
        ' It takes a list of specifications as input, fetches and parses the latest Editor\'s Draft' +
        ' of each of these specifications to study the IDL content that it defines, the links that it' +
        ' contains, and the normative and informative references that it lists.');
    w();
    w('The report below lists incoming links for each specification, in other words the list' +
        ' of specifications that normatively or informatively reference a given specification.');
    w();
    w('By definition, Reffy only knows about incoming links from specifications that have been' +
        ' crawled and that could successfully be parsed. Other specifications that Reffy does' +
        ' not know anything about may reference specifications listed here.');
    w();
    results.forEach(spec => {
        w('## ' + spec.title);
        w();
        writeCrawlInfo(spec);
        w();
        writeDependenciesInfo(spec, results);
        w();
        w();
    });
}


/**
 * Outputs a human-readable diff between two crawl reports, one entry per spec.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateDiffReport(crawlResults, crawlRef, options) {
    options = options || {};
    const w = console.log.bind(console);

    // Compute report information for both crawl versions
    const results = processReport(crawlResults.results);
    const resultsRef = processReport(crawlRef.results);
    
    // Compute diff for all specs
    // (note we're only interested in specs that are part in the new crawl,
    // and won't report on specs that were there before and got dropped)
    let resultsDiff = results.map(spec => {
        let ref = resultsRef.find(s => s.url === spec.url) || {
            missing: true,
            report: {
                unknownIdlNames: [],
                redefinedIdlNames: [],
                missingWebIdlRef: [],
                missingLinkRef: [],
                inconsistentRef: []
            }
        };

        const report = spec.report;
        const reportRef = ref.report;

        const getSimpleDiff = prop =>
            (report[prop] !== reportRef[prop]) ?
            {
                ins: (typeof report[prop] !== 'undefined') ? report[prop] : null,
                del: (typeof reportRef[prop] !== 'undefined') ? reportRef[prop] : null
            } :
            null;
        const getArrayDiff = (prop, key) =>
            (!arrayEquals(report[prop], reportRef[prop], key) &&
                (!options.onlyNew || report[prop].find(item => !reportRef[prop].find(i => (key ? i[key] === item[key] : i === item))))) ?
            {
                ins: report[prop].filter(item => !reportRef[prop].find(i => (key ? i[key] === item[key] : i === item))),
                del: reportRef[prop].filter(item => !report[prop].find(i => (key ? i[key] === item[key] : i === item)))
            } :
            null;

        // Compute diff between new and ref report for that spec
        const diff = {
            title: (spec.title !== ref.title) ? {
                ins: (typeof spec.title !== 'undefined') ? spec.title : null,
                del: (typeof ref.title !== 'undefined') ? ref.title : null
            } : null,
            ok: getSimpleDiff('ok'),
            error: getSimpleDiff('error'),
            noNormativeRefs: getSimpleDiff('noNormativeRefs'),
            noRefToWebIDL: getSimpleDiff('noRefToWebIDL'),
            noIdlContent: getSimpleDiff('noIdlContent'),
            hasInvalidIdl: getSimpleDiff('hasInvalidIdl'),
            hasObsoleteIdl: getSimpleDiff('hasObsoleteIdl'),
            unknownIdlNames: getArrayDiff('unknownIdlNames'),
            redefinedIdlNames: getArrayDiff('redefinedIdlNames', 'name'),
            missingWebIdlRef: getArrayDiff('missingWebIdlRef', 'name'),
            missingLinkRef: getArrayDiff('missingLinkRef'),
            inconsistentRef: getArrayDiff('inconsistentRef', 'link')
        };

        return {
            title: spec.title,
            shortname: spec.shortname,
            date: spec.date,
            url: spec.url,
            latest: spec.latest,
            datedUrl: spec.datedUrl,
            datedStatus: spec.datedStatus,
            edDraft: spec.edDraft,
            crawled: spec.crawled,
            repository: spec.repository,
            isNewSpec: ref.missing,
            hasDiff: Object.keys(diff).some(key => diff[key] !== null),
            diff
        };
    });

    if (!options.onlyNew) {
        resultsDiff = resultsDiff.concat(resultsRef
            .map(spec => {
                let ref = results.find(s => s.url === spec.url);
                if (ref) return null;
                return {
                    title: spec.title,
                    shortname: spec.shortname,
                    date: spec.date,
                    url: spec.url,
                    latest: spec.latest,
                    datedUrl: spec.datedUrl,
                    datedStatus: spec.datedStatus,
                    edDraft: spec.edDraft,
                    crawled: spec.crawled,
                    repository: spec.repository,
                    isUnknownSpec: true,
                    hasDiff: true
                };
            })
            .filter(spec => !!spec));
        resultsDiff.sort(byTitle);
    }

    w('% Diff between report from "' +
        (new Date(crawlResults.date)).toLocaleDateString('en-US', dateOptions) +
        '" and reference report from "' + 
        (new Date(crawlRef.date)).toLocaleDateString('en-US', dateOptions) +
        '"');
    w('% Reffy');
    w('% ' + (new Date(crawlResults.date)).toLocaleDateString('en-US', dateOptions));
    w();

    resultsDiff.forEach(spec => {
        // Nothing to report if crawl result is the same
        if (!spec.hasDiff) {
            return;
        }

        w('## ' + spec.title);
        w();
        w('- URL: [' + spec.url + '](' + spec.url + ')');
        let crawledVersion = 'Initial URL';
        if ((spec.crawled === spec.datedUrl) || (spec.crawled === spec.latest)) {
            crawledVersion = 'Latest published version';
        }
        else if (spec.crawled === spec.edDraft) {
            crawledVersion = 'Editor\'s Draft';
        }
        else if (spec.crawled.indexOf('spec.whatwg.org') !== -1) {
            crawledVersion = 'Living Standard';
        }
        w('- Crawled version: [' + crawledVersion + '](' + spec.crawled + ')');
        if (spec.edDraft && (spec.edDraft !== spec.crawled)) {
            w('- Editor\'s Draft: [' + spec.edDraft + '](' + spec.edDraft + ')');
        }
        if (spec.repository) {
            let githubcom = spec.repository.match(/^https:\/\/github.com\/([^\/]*)\/([^\/]*)/);
            let repositoryName = spec.repository;
            if (githubcom) {
                repositoryName = 'GitHub ' + githubcom[1] + '/' + githubcom[2];
            }
            w('- Repository: [' + repositoryName + '](' + spec.repository + ')');
        }

        if (spec.isNewSpec) {
            w('- This specification was not in the reference crawl report.');
            w();
            w();
            return;
        }

        if (spec.isUnknownSpec) {
            w('- This specification is not in the new crawl report.');
            w();
            w();
            return;
        }

        const diff = spec.diff;
        const simpleDiff = prop =>
            ((diff[prop].ins !== null) ? '*INS* ' + diff[prop].ins : '') +
            (((diff[prop].ins !== null) && (diff[prop].del !== null)) ? ' / ' : '') +
            ((diff[prop].del !== null) ? '*DEL* ' + diff[prop].del : '');
        const arrayDiff = (prop, key) =>
            ((diff[prop].ins.length > 0) ? '*INS* ' + diff[prop].ins.map(i => (key ? i[key] : i)).join(', ') : '') +
            (((diff[prop].ins.length > 0) && (diff[prop].del.length > 0)) ? ' / ' : '') +
            ((diff[prop].del.length > 0) ? '*DEL* ' + diff[prop].del.map(i => (key ? i[key] : i)).join(', ') : '');

        [
            { title: 'Spec title', prop: 'title', diff: 'simple' },
            { title: 'Spec is OK', prop: 'ok', diff: 'simple' },
            { title: 'Spec could not be rendered', prop: 'error', diff: 'simple' },
            { title: 'No normative references found', prop: 'noNormativeRefs', diff: 'simple' },
            { title: 'No WebIDL definitions found', prop: 'noIdlContent', diff: 'simple' },
            { title: 'Invalid WebIDL content found', prop: 'hasInvalidIdl', diff: 'simple' },
            { title: 'Obsolete WebIDL constructs found', prop: 'hasObsoleteIdl', diff: 'simple' },
            { title: 'Spec does not reference WebIDL normatively', prop: 'noRefToWebIDL', diff: 'simple' },
            { title: 'Unknown WebIDL names used', prop: 'unknownIdlNames', diff: 'array' },
            { title: 'WebIDL names also defined elsewhere', prop: 'redefinedIdlNames', diff: 'array', key: 'name' },
            { title: 'Missing references for WebIDL names', prop: 'missingWebIdlRef', diff: 'array', key: 'name' },
            { title: 'Missing references for links', prop: 'missingLinkRef', diff: 'array' },
            { title: 'Inconsistent references for links', prop: 'inconsistentRef', diff: 'array', key: 'link' }
        ].forEach(item => {
            // Only report actual changes, and don't report other changes when
            // the spec could not be rendered in one of the crawl reports
            if (diff[item.prop] && ((item.prop === 'error') || (item.prop === 'title') || (item.prop === 'latest') || !diff.error)) {
                w('- ' + item.title + ': ' + ((item.diff === 'simple') ?
                    simpleDiff(item.prop) :
                    arrayDiff(item.prop, item.key)));
            }
        });
        w();
        w();
    });
}


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    const crawlResultsPath = process.argv[2];
    const perSpec = !!process.argv[3] || (process.argv[3] === 'perspec');
    const depReport = (process.argv[3] === 'dep');
    const diffReport = (process.argv[3] === 'diff');
    const refResultsPath = diffReport ? process.argv[4] : null;
    const onlyNew = (process.argv[5] === 'onlynew');

    if (!crawlResultsPath) {
        console.error("Required filename parameter missing");
        process.exit(2);
    }
    if (diffReport && !refResultsPath) {
        console.error("Required filename to reference crawl for diff missing");
        process.exit(2);
    }

    let crawlResults;
    try {
        crawlResults = require(crawlResultsPath);
    } catch(e) {
        console.error("Impossible to read " + crawlResultsPath + ": " + e);
        process.exit(3);
    }

    if (diffReport) {
        if (refResultsPath.startsWith('http')) {
            fetch(refResultsPath, { nolog: true })
                .catch(e => {
                    console.error("Impossible to fetch " + refResultsPath + ": " + e);
                    process.exit(3);
                })
                .then(r => r.json())
                .then(refResults => generateDiffReport(crawlResults, refResults, { onlyNew }));
        }
        else {
            let refResults = {};
            try {
                refResults = require(refResultsPath);
            } catch(e) {
                console.error("Impossible to read " + refResultsPath + ": " + e);
                process.exit(3);
            }
            generateDiffReport(crawlResults, refResults, { onlyNew });
        }
    }
    else if (depReport) {
        generateDependenciesReport(crawlResults);
    }
    else if (perSpec) {
        generateReportPerSpec(crawlResults);
    }
    else {
        generateReportPerIssue(crawlResults);
    }
}
