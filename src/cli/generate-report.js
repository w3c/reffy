#!/usr/bin/env node
/**
 * The Markdown report generator takes an anomalies report as input and
 * generates a human-readable report in Markdown out of it. Depending on
 * parameters, the generated report may be a report per spec, a report per
 * issue, a dependencies report, or a diff report.
 *
 * The report generator can also take a crawl report as input. In that case, it
 * will first start by running the [crawl analyzer]{@link module:analyzer} to
 * produce the anomalies report.
 *
 * The report generator can be called directly through:
 *
 * `node generate-report.js [anomalies report] [type]`
 *
 * where `anomalies report` is the name of a JSON file that contains the
 * anomalies report to parse (or the crawl report), and `type` is an optional
 * parameter that specifies the type of report to generate, one of `perspec`
 * (default value) to produce a report per spec, `perissue` to produce a report
 * per issue, `dep` to produce a dependencies report, or `diff` to produce a
 * diff report. When `diff` is used, an extra parameter must be given which must
 * point to the reference anomalies report the new report needs to be compared
 * with.
 *
 * @module markdownGenerator
 */

const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const fetch = require('../lib/util').fetch;
const studyCrawl = require('./study-crawl').studyCrawl;


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
 * Helper function that outputs main crawl info about a spec
 *
 * @function
 */
function writeCrawlInfo(spec, withHeader, w) {
    let wres = '';
    w = w || (msg => wres += (msg || '') + '\n');

    if (withHeader) {
        w('### Spec info {.info}');
    }
    else  {
        w('Spec info:');
    }
    w();

    let crawledUrl = spec.crawled || spec.latest;
    w('- Initial URL: [' + spec.url + '](' + spec.url + ')');
    w('- Crawled URL: [' + crawledUrl + '](' + crawledUrl + ')');
    if (spec.date) {
        w('- Crawled version: ' + spec.date);
    }
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
    return wres;
}


function writeDependenciesInfo(spec, results, withHeader, w) {
    let wres = '';
    w = w || (msg => wres += (msg || '') + '\n');

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
    return wres;
}

/**
 * Outputs a human-readable Markdown anomaly report from a crawl report,
 * with one entry per spec.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateReportPerSpec(study) {
    var count = 0;
    let wres = '';
    const w = msg => wres += (msg || '') + '\n';
    const results = study.results;

    w('% ' + (study.title || 'Reffy crawl results'));
    w('% Reffy');
    w('% ' + (new Date(study.date)).toLocaleDateString('en-US', dateOptions));
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
        writeCrawlInfo(spec, true, w);
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
            if (report.noEdDraft) {
                w('- Link to an Editor\'s Draft not found');
            }
            if (report.noNormativeRefs) {
                w('- No normative references found');
            }
            if (report.noIdlContent) {
                w('- No WebIDL definitions found');
            }
            if (report.noCssDefinitions) {
                w('- No CSS definitions found');
            }
            if (report.hasUnexpectedIdl) {
                w('- Unexpected WebIDL definitions found')
            }
            if (report.hasUnexpectedCssDefinitions) {
                w('- Unexpected CSS definitions found')
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
            if (report.unknownExposedNames &&
                (report.unknownExposedNames.length > 0)) {
                w('- Unknown [Exposed] names used: ' +
                    report.unknownExposedNames.map(name => '`' + name + '`').join(', '));
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
        writeDependenciesInfo(spec, results, true, w);
        w();
        w();
    });
    w();
    w();

    return wres;
}


/**
 * Outputs a human-readable Markdown anomaly report from a crawl report,
 * sorted by type of anomaly.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateReportPerIssue(study) {
    let wres = '';
    const w = msg => wres += (msg || '') + '\n';

    let count = 0;
    let results = study.results;

    w('% ' + (study.title || 'Reffy crawl results'));
    w('% Reffy');
    w('% ' + (new Date(study.date)).toLocaleDateString('en-US', dateOptions));
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
    w('## Specifications that do not link to an Editor\'s Draft');
    w();
    results
        .filter(spec => spec.report.noEdDraft)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('It is good practice to link to Editor\'s Draft for W3C specifications ' +
            'even for specifications published as Recommendations. Reffy (or ' +
            'rather the W3C API) could not find a link to an Editor\'s Draft ' +
            'for the specifications mentioned above.');
    }
    w();
    w();


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
        w('Reffy was expecting to find IDL content in the specifications ' + 
            ' listed here but could not extract any.');
    }
    w();
    w();


    count = 0;
    w('## Specifications without CSS definitions');
    w();
    results
        .filter(spec => spec.report.noCssDefinitions)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('Reffy was expecting to find CSS definitions in the specifications ' + 
            ' listed here but could not extract any.');
    }
    w();
    w();

    count = 0;
    w('## Specifications with unexpected WebIDL definitions');
    w();
    results
        .filter(spec => spec.report.hasUnexpectedIdl)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('Reffy was not expecting to find IDL content in the specifications' +
            ' listed here but it did. Note that Reffy cannot deal with' +
            ' specifications that define IDL content and exist at different' +
            ' levels: only one level is flagged as defining the IDL. Other' +
            ' levels will incorrectly appear in this list as a consequence.');
    }
    w();
    w();

    count = 0;
    w('## Specifications with unexpected CSS definitions');
    w();
    results
        .filter(spec => spec.report.hasUnexpectedCssDefinitions)
        .forEach(spec => {
            count += 1;
            w('- [' + spec.title + '](' + spec.crawled + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('Reffy was not expecting to find CSS definitions in the' +
            ' specifications listed here but it did.');
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
    w('## List of [Exposed] names not defined in the specifications crawled');
    w();
    var idlNames = {};
    results.forEach(spec => {
        if (!spec.report.unknownExposedNames ||
            (spec.report.unknownExposedNames.length === 0)) {
            return;
        }
        spec.report.unknownExposedNames.forEach(name => {
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
    w('=> ' + count + ' [Exposed] name' + ((count > 1) ? 's' : '') + ' found');
    if (count > 0) {
        w();
        w('Please keep in mind that Reffy only knows about IDL terms defined in the' +
            ' specifications that were crawled **and** that do not have invalid IDL content.');
    }
    w();
    w();


    count = 0;
    w('## List of WebIDL names not defined in the specifications crawled');
    w();
    idlNames = {};
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

    return wres;
}


/**
 * Outputs a human-readable Markdown dependencies report from a crawl report,
 * one entry per spec.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateDependenciesReport(study) {
    let wres = '';
    const w = msg => wres += (msg || '') + '\n';

    let count = 0;
    const results = study.results;

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
        writeCrawlInfo(spec, false, w);
        w();
        writeDependenciesInfo(spec, results, false, w);
        w();
        w();
    });

    return wres;
}


/**
 * Outputs a human-readable diff between two crawl reports, one entry per spec.
 *
 * The function spits the report to the console.
 *
 * @function
 */
function generateDiffReport(study, refStudy, options) {
    options = options || {};
    let wres = '';
    const w = msg => wres += (msg || '') + '\n';

    const results = study.results;
    const resultsRef = refStudy.results;
    
    // Compute diff for all specs
    // (note we're only interested in specs that are part in the new crawl,
    // and won't report on specs that were there before and got dropped)
    let resultsDiff = results.map(spec => {
        let ref = resultsRef.find(s => s.url === spec.url) || {
            missing: true,
            report: {
                unknownExposedNames: [],
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
            noEdDraft: getSimpleDiff('noEdDraft'),
            noNormativeRefs: getSimpleDiff('noNormativeRefs'),
            noRefToWebIDL: getSimpleDiff('noRefToWebIDL'),
            noIdlContent: getSimpleDiff('noIdlContent'),
            noCssDefinitions: getSimpleDiff('noCssDefinitions'),
            hasUnexpectedIdl: getSimpleDiff('hasUnexpectedIdl'),
            hasUnexpectedCssDefinitions: getSimpleDiff('hasUnexpectedCssDefinitions'),
            hasInvalidIdl: getSimpleDiff('hasInvalidIdl'),
            hasObsoleteIdl: getSimpleDiff('hasObsoleteIdl'),
            unknownExposedNames: getArrayDiff('unknownExposedNames'),
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
        (new Date(study.date)).toLocaleDateString('en-US', dateOptions) +
        '" and reference report from "' + 
        (new Date(refStudy.date)).toLocaleDateString('en-US', dateOptions) +
        '"');
    w('% Reffy');
    w('% ' + (new Date(study.date)).toLocaleDateString('en-US', dateOptions));
    w();

    resultsDiff.forEach(spec => {
        // Nothing to report if crawl result is the same
        if (!spec.hasDiff) {
            return;
        }

        w('## ' + spec.title);
        w();

        let crawledUrl = spec.crawled || spec.latest;
        w('- Initial URL: [' + spec.url + '](' + spec.url + ')');
        w('- Crawled URL: [' + crawledUrl + '](' + crawledUrl + ')');
        if (spec.edDraft && (spec.edDraft !== crawledUrl)) {
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
            { title: 'Link to an Editor\'s Draft not found', prop: 'noEdDraft', diff: 'simple' },
            { title: 'No normative references found', prop: 'noNormativeRefs', diff: 'simple' },
            { title: 'No WebIDL definitions found', prop: 'noIdlContent', diff: 'simple' },
            { title: 'No CSS definitions found', prop: 'noCssDefinitions', diff: 'simple' },
            { title: 'Unexpected WebIDL definitions found', prop: 'hasUnexpectedIdl', diff: 'simple' },
            { title: 'Unexpected CSS definitions found', prop: 'hasUnexpectedCssDefinitions', diff: 'simple' },
            { title: 'Invalid WebIDL content found', prop: 'hasInvalidIdl', diff: 'simple' },
            { title: 'Obsolete WebIDL constructs found', prop: 'hasObsoleteIdl', diff: 'simple' },
            { title: 'Spec does not reference WebIDL normatively', prop: 'noRefToWebIDL', diff: 'simple' },
            { title: 'Unknown [Exposed] names used', prop: 'unknownExposedNames', diff: 'array' },
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

    return wres;
}


/**
 * Main function that generates a Markdown report from a study file.
 *
 * @function
 * @param {String} studyFile Path to the study file to parse
 * @param {Object} options Type of report to generate and other options
 * @return {String} The generated report
 */
async function generateReport(studyFile, options) {
    options = options || {};
    if (!studyFile) {
        throw new Error('Required filename parameter missing');
    }
    if (options.diffReport && !options.refStudyFile) {
        throw new Error('Required filename to reference crawl for diff missing');
    }

    let study;
    try {
        study = requireFromWorkingDirectory(studyFile);
    } catch (e) {
        throw new Error('Impossible to read ' + studyFile + ': ' + e);
    }

    // Study the result of the crawl if the contents we have is not already the
    // study result.
    if (study.type !== 'study') {
        study = studyCrawl(study);
    }

    if (options.diffReport) {
        if (options.refStudyFile.startsWith('http')) {
            try {
                let response = await fetch(options.refStudyFile, { nolog: true });
                let refStudy = await response.json();
                if (refStudy.type !== 'study') {
                    refStudy = studyCrawl(refStudy);
                }
                return generateDiffReport(study, refStudy, { onlyNew: options.onlyNew });
            }
            catch (e) {
                throw new Error('Impossible to fetch ' + options.refStudyFile + ': ' + e);
            }
        }
        else {
            let refStudy = {};
            try {
                refStudy = requireFromWorkingDirectory(options.refStudyFile);
            } catch (e) {
                throw new Error('Impossible to read ' + options.refStudyFile + ': ' + e);
            }
            if (refStudy.type !== 'study') {
                refStudy = studyCrawl(refStudy);
            }
            return generateDiffReport(study, refStudy, { onlyNew: options.onlyNew });
        }
    }
    else if (options.depReport) {
        return generateDependenciesReport(study);
    }
    else if (options.perSpec) {
        return generateReportPerSpec(study);
    }
    else {
        return generateReportPerIssue(study);
    }
    return report;
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.generateReport = generateReport;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    const studyFile = process.argv[2];
    const options = {
        perSpec: !!process.argv[3] || (process.argv[3] === 'perspec'),
        depReport: (process.argv[3] === 'dep'),
        diffReport: (process.argv[3] === 'diff'),
        refStudyFile: (process.argv[3] === 'diff') ? process.argv[4] : null,
        onlyNew: (process.argv[5] === 'onlynew')
    };

    generateReport(studyFile, options)
        .then(report => console.log(report))
        .catch(err => console.error(err.toString()));
}
