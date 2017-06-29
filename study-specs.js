var array_concat = (a,b) => a.concat(b);
var array_unique = (n, i, a) => a.indexOf(n) === i;

const canonicalizeURL = require('./canonicalize-url');

/**
 * Helper function that returns true when the given URL seems to target a real
 * "spec" (as opposed to, say, a Wiki page, or something else)
 */
const matchSpecUrl = url => url.match(/spec.whatwg.org/) || url.match(/www.w3.org\/TR\/[a-z0-9]/) || (url.match(/w3c.github.io/) && ! url.match(/w3c.github.io\/test-results\//));


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
        .map(r => r.idl && r.idl.idlNames ? Object.keys(r.idl.idlNames).filter(n => n !== "_dependencies") : [], [])
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

    var sortedResults = results.sort((a,b) =>
        a.title.toUpperCase().localeCompare(b.title.toUpperCase()));

    // Construct spec equivalence from the crawl report, which should be more
    // complete than the initial equivalence list.
    var specEquivalents = {};
    sortedResults.forEach(spec =>
        spec.versions.forEach(v => { specEquivalents[v] = spec.url; }
    ));

    // Strong canonicalization options to find references
    var useEquivalents = {
        datedToLatest: true,
        equivalents: specEquivalents
    };

    return sortedResults
        .map(spec => {
            var idlDfns = (spec.idl && spec.idl.idlNames) ?
                Object.keys(spec.idl.idlNames).filter(name => (name !== '_dependencies')) : [];
            var idlDeps = (spec.idl && spec.idl.externalDependencies) ?
                spec.idl.externalDependencies : [];

            var report = {
                // An error at this level means the spec could not be parsed at all
                error: spec.error,

                // Whether the crawler found normative references
                // (most specs should have)
                hasNormativeRefs: (spec.refs.normative &&
                    (spec.refs.normative.length > 0)),

                // Whether the spec normatively references the WebIDL spec
                // (all specs that define IDL content should)
                referencesWebIDL: (spec === WebIDLSpec) ||
                    (spec.refs.normative && spec.refs.normative.find(ref =>
                        ref.name.match(/^WebIDL/i) ||
                            (ref.url === WebIDLSpec.url) ||
                            (ref.url === WebIDLSpec.latest))),

                // Whether the crawler managed to find IDL content in the spec
                // (most specs crawled here should)
                hasIdl: !((Object.keys(spec.idl).length === 0) ||
                    (!spec.idl.idlNames && !spec.idl.message) ||
                    (spec.idl.idlNames &&
                        (Object.keys(spec.idl.idlNames).length === 1) &&
                        (Object.keys(spec.idl.idlExtendedNames).length === 0))),

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
                // other spec which does not seem to appear in the list of
                // normative references
                // (There should always be an entry in the normative list of
                // references that links to that other spec)
                missingWebIdlReferences: idlDeps
                    .filter(name => knownIdlNames.indexOf(name) !== -1)
                    .map(name => {
                        var refs = idlNamesIndex[name];
                        var ref = null;
                        if (spec.refs && spec.refs.normative) {
                            ref = refs.find(s => !!spec.refs.normative.find(r =>
                                (canonicalizeURL(r.url, useEquivalents) === s.url)));
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
                missingReferences: spec.links
                    .filter(matchSpecUrl)
                    .filter(l => {
                        // Filter out "good" and "inconsistent" references
                        let canon = canonicalizeURL(l, useEquivalents);
                        let refs = (spec.refs.normative || []).concat(spec.refs.informative || []);
                        return !refs.find(r => canonicalizeURL(r.url, useEquivalents) === canon);
                    })
                    .filter(l =>
                        // Ignore links to other versions of "self". There may
                        // be cases where it would be worth reporting them but
                        // most of the time they appear in "changelog" sections.
                        (spec.url !== canonicalizeURL(l, useEquivalents)) &&
                        !spec.versions.includes(canonicalizeURL(l, useEquivalents))
                    ),

                // Links to external specifications within the body of the spec
                // that have a corresponding entry in the references, but for
                // which the reference uses a different URL, e.g. because the
                // link targets the Editor's Draft, whereas the reference
                // targets the latest published version
                inconsistentReferences: spec.links
                    .filter(matchSpecUrl)
                    .map(l => {
                        let canonSimple = canonicalizeURL(l);
                        let canon = canonicalizeURL(l, useEquivalents);
                        let refs = (spec.refs.normative || []).concat(spec.refs.informative || []);

                        // Filter out "good" references
                        if (refs.find(r => canonicalizeURL(r.url) === canonSimple)) {
                            return null;
                        }
                        let ref = refs.find(r => canonicalizeURL(r.url, useEquivalents) === canon);
                        return (ref ? { link: l, ref } : null);
                    })
                    .filter(l => !!l),

                // Lists of specs present in the crawl report that reference
                // the current spec, either normatively or informatively
                // (used to produce the dependencies report)
                referencedBy: {
                    normative: sortedResults.filter(s =>
                        s.refs.normative && s.refs.normative.find(r =>
                            (spec.url === canonicalizeURL(r.url, useEquivalents)) ||
                            spec.versions.includes(canonicalizeURL(r.url, useEquivalents)))),
                    informative: sortedResults.filter(s =>
                        s.refs.informative && s.refs.informative.find(r =>
                            (spec.url === canonicalizeURL(r.url, useEquivalents)) ||
                            spec.versions.includes(canonicalizeURL(r.url, useEquivalents))))
                }
            };

            // A spec is OK if it does not contain anything "suspicious".
            report.ok = !report.error &&
                report.hasNormativeRefs &&
                report.hasIdl &&
                !report.hasInvalidIdl &&
                !report.hasObsoleteIdl &&
                report.referencesWebIDL &&
                (!report.unknownIdlNames || (report.unknownIdlNames.length === 0)) &&
                (!report.redefinedIdlNames || (report.redefinedIdlNames.length === 0)) &&
                (!report.missingWebIdlReferences || (report.missingWebIdlReferences.length === 0)) &&
                (report.missingReferences.length === 0) &&
                (report.inconsistentReferences.length === 0);
            var res = {
                title: spec.title,
                shortname: spec.shortname,
                date: spec.date,
                url: spec.url,
                latest: spec.latest,
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
function writeCrawlInfo(spec) {
    var w = console.log.bind(console);

    w('Crawl info:');
    w();
    w('- URL: [' + (spec.latest ?
        ((spec.latest.indexOf('www.w3.org/TR/') !== -1) ? 'Latest published version' : 'Editor\'s Draft') :
        ((spec.url.indexOf('spec.whatwg.org') !== -1) ? 'Living Standard' : 'Initial URL'))
        + '](' + (spec.latest || spec.url) + ')');
    w('- Shortname: ' + (spec.shortname || 'no shortname'));
    w('- Date: ' + (spec.date || 'unknown'));
}


/**
 * Outputs a human-readable Markdown anomaly report from a crawl report,
 * with one entry per spec.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateReportPerSpec(results) {
    var count = 0;
    var w = console.log.bind(console);

    // Compute report information
    results = processReport(results);

    w('# Reffy crawl report');
    w();
    writeGenericInfo();
    w();
    count = results.length;
    w('' + count + ' specification' + ((count > 1) ? 's' : '') + ' were crawled in this report.');
    w();
    w();

    w('## Specifications without known issues');
    w();
    w('Reffy does not have anything special to report about the following specifications:')
    w();
    count = 0;
    results
        .filter(spec => spec.report.ok)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    w();
    w();

    let parsingErrors = results.filter(spec => spec.report.error);
    if (parsingErrors.length > 0) {
        w('## Specifications that could not be parsed');
        w();
        w('Reffy could not render these specifications for some reason.' +
            ' This may happen when a specification uses an old version of ReSpec.');
        w();
        count = 0;
        parsingErrors.forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
        });
        w();
        w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
        w();
        w();
    }

    w('## Specifications with possible issues');
    w();
    results
        .filter(spec => !spec.report.ok && !spec.report.error)
        .forEach(spec => {
            w('### ' + spec.title);
            w();
            writeCrawlInfo(spec);
            w();

            var report = spec.report;
            w('Potential issue(s):');
            w();
            if (!report.hasNormativeRefs) {
                w('- No normative references found');
            }
            if (!report.hasIdl) {
                w('- No WebIDL definitions found');
            }
            if (report.hasInvalidIdl) {
                w('- Invalid WebIDL content found');
            }
            if (report.hasObsoleteIdl) {
                w('- Obsolete WebIDL constructs found');
            }
            if (report.hasIdl && !report.referencesWebIDL) {
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
                        i.refs.map(ref => ('[' + ref.title + '](' + (ref.latest || ref.url) + ')')).join(' and '));
                });
            }
            if (report.missingWebIdlReferences &&
                (report.missingWebIdlReferences.length > 0)) {
                w('- Missing references for WebIDL names: ');
                report.missingWebIdlReferences.map(i => {
                    w('     * `' + i.name + '` defined in ' +
                        i.refs.map(ref => ('[' + ref.title + '](' + (ref.latest || ref.url) + ')')).join(' or '));
                });
            }
            if (report.missingReferences &&
                (report.missingReferences.length > 0)) {
                w('- Missing references for links: ');
                report.missingReferences.map(l => {
                    w('     * [`' + l + '`](' + l + ')');
                });
            }
            if (report.inconsistentReferences &&
                (report.inconsistentReferences.length > 0)) {
                w('- Inconsistent references for links: ');
                report.inconsistentReferences.map(l => {
                    w('     * [`' + l.link + '`](' + l.link + '), related reference "' + l.ref.name + '" uses URL [`' + l.ref.url + '`](' + l.ref.url + ')');
                });
            }
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
function generateReport(results) {
    var count = 0;
    var w = console.log.bind(console);

    // Compute report information
    results = processReport(results);

    w('# Reffy crawl report');
    w();

    writeGenericInfo();
    w();
    count = results.length;
    w('' + count + ' specification' + ((count > 1) ? 's' : '') + ' were crawled in this report.');
    w();
    w();

    let parsingErrors = results.filter(spec => spec.report.error);
    if (parsingErrors.length > 0) {
        w('## Specifications that could not be parsed');
        w();
        w('Reffy could not render these specifications for some reason.' +
            ' This may happen when a specification uses an old version of ReSpec.');
        w();
        count = 0;
        parsingErrors.forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
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
        .filter(spec => !spec.report.hasNormativeRefs)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
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
        .filter(spec => !spec.report.hasIdl)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
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
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
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
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
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
        if (spec.report.hasIdl && !spec.report.referencesWebIDL) {
            count += 1;
            w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')');
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
            idlNames[name].map(ref => ('[' + ref.title + '](' + (ref.latest || ref.url) + ')')).join(', '));
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
            idlNames[name].map(ref => ('[' + ref.title + '](' + (ref.latest || ref.url) + ')')).join(' and '));
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
        if (spec.report.missingWebIdlReferences &&
            (spec.report.missingWebIdlReferences.length > 0)) {
            count += 1;
            if (spec.report.missingWebIdlReferences.length === 1) {
                countrefs += 1;
                let i = spec.report.missingWebIdlReferences[0];
                w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')' +
                    ' uses `' + i.name + '` but does not reference ' +
                    i.refs.map(ref => ('[' + ref.title + '](' + (ref.latest || ref.url) + ')')).join(' or '));
            }
            else {
                w('- [' + spec.title + '](' + (spec.latest || spec.url) + ') uses:');
                spec.report.missingWebIdlReferences.map(i => {
                    countrefs += 1;
                    w('    * `' + i.name + '` but does not reference ' +
                        i.refs.map(ref => ('[' + ref.title + '](' + (ref.latest || ref.url) + ')')).join(' or '));
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
        if (spec.report.missingReferences &&
            (spec.report.missingReferences.length > 0)) {
            count += 1;
            if (spec.report.missingReferences.length === 1) {
                countrefs += 1;
                let l = spec.report.missingReferences[0];
                w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')' +
                  ' links to [`' + l + '`](' + l + ') but does not list it' +
                  ' in its references');
            }
            else {
                w('- [' + spec.title + '](' + (spec.latest || spec.url) + ') links to:');
                spec.report.missingReferences.forEach(l => {
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
        if (spec.report.inconsistentReferences &&
            (spec.report.inconsistentReferences.length > 0)) {
            count += 1;
            if (spec.report.inconsistentReferences.length === 1) {
                countrefs += 1;
                let l = spec.report.inconsistentReferences[0];
                w('- [' + spec.title + '](' + (spec.latest || spec.url) + ')' +
                  ' links to [`' + l.link + '`](' + l.link + ') but related reference "' + l.ref.name + '" uses URL [`' + l.ref.url + '`](' + l.ref.url + ')');
            }
            else {
                w('- [' + spec.title + '](' + (spec.latest || spec.url) + ') links to:');
                spec.report.inconsistentReferences.forEach(l => {
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
function generateDependenciesReport(results) {
    var count = 0;
    var w = console.log.bind(console);

    // Compute report information
    results = processReport(results);

    w('# Reffy dependencies report');
    w();
    results.forEach(spec => {
        w('## ' + spec.title);
        w();
        writeCrawlInfo(spec);
        w();
        if (spec.report.referencedBy.normative.length > 0) {
            w('Normative references to this spec from:');
            w();
            spec.report.referencedBy.normative.forEach(s => {
                w('- [' + s.title + '](' + (s.latest || s.url) + ')');
            });
        }
        else {
            w('No normative reference to this spec from other specs.');
        }
        w();

        if (spec.report.referencedBy.informative.length > 0) {
            w('Informative references to this spec from:');
            w();
            spec.report.referencedBy.informative.forEach(s => {
                w('- [' + s.title + '](' + (s.latest || s.url) + ')');
            });
        }
        else {
            w('No informative reference to this spec from other specs.');
        }
        w();
        w();
    });
}


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var specResultsPath = process.argv[2];
    var perSpec = !!process.argv[3] || (process.argv[3] === 'perspec');
    var depReport = (process.argv[3] === 'dep');
    if (!specResultsPath) {
        console.error("Required filename parameter missing");
        process.exit(2);
    }
    var specResults;
    try {
        specResults = require(specResultsPath);
    } catch(e) {
        console.error("Impossible to read " + specresultsPath + ": " + e);
        process.exit(3);
    }
    if (depReport) {
        generateDependenciesReport(specResults);
    }
    else if (perSpec) {
        generateReportPerSpec(specResults);
    }
    else {
        generateReport(specResults);
    }
}
