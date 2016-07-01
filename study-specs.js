var array_concat = (a,b) => a.concat(b);
var array_unique = (n, i, a) => a.indexOf(n) === i;


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

    return results
        .sort((a, b) => {
            var A = a.title.toUpperCase();
            var B = b.title.toUpperCase();
            if (A < B) {
                return -1;
            }
            if (A > B) {
                return 1;
            }
            return 0;
        })
        .map(spec => {
            var idlDeps = (spec.idl && spec.idl.externalDependencies) ?
                spec.idl.externalDependencies : [];
            var report = {
                noNormativeRefs: (!spec.refs.normative ||
                    (spec.refs.normative.length === 0)),
                noIdl: ((Object.keys(spec.idl).length === 0) ||
                    (!spec.idl.idlNames && !spec.idl.message) ||
                    (spec.idl.idlNames &&
                        (Object.keys(spec.idl.idlNames).length === 1) &&
                        (Object.keys(spec.idl.idlExtendedNames).length === 0))),
                invalidIdl: !!(!spec.idl.idlNames && spec.idl.message),
                unknownIdlNames: idlDeps
                    .filter(name => knownIdlNames.indexOf(name) === -1)
                    .sort(),
                missingReferences: idlDeps
                    .filter(name => knownIdlNames.indexOf(name) !== -1)
                    .map(name => {
                        var refs = idlNamesIndex[name];
                        var ref = null;
                        if (spec.refs && spec.refs.normative) {
                            ref = refs.find(s =>
                                !!spec.refs.normative.find(r =>
                                    (r.url === s.latest) || (r.url === s.url)
                                )
                            );
                        }
                        return (ref ? null : {
                            name,
                            refs
                        });
                    })
                    .filter(i => !!i)
            };
            report.ok = !report.noNormativeRefs &&
                !report.noIdl &&
                !report.invalidIdl &&
                (!report.unknownIdlNames || (report.unknownIdlNames.length === 0)) &&
                (!report.missingReferences || (report.missingReferences.length === 0));
            var res = {
                title: spec.title,
                shortname: spec.shortname,
                url: spec.url,
                latest: spec.latest,
                report
            };
            return res;
        });
}


function generateReportPerSpec(results) {
    var count = 0;
    var w = console.log.bind(console);

    // Compute report information
    results = processReport(results);

    w('# Reffy crawl report');
    w();
    w('## Specifications without known issues');
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

    w('## Specifications with possible issues');
    w();
    results
        .filter(spec => !spec.report.ok)
        .forEach(spec => {
            w('### ' + spec.title);
            w();
            w('Crawl info:');
            w('- URL: [' + (spec.latest ?
                ((spec.latest.indexOf('www.w3.org/TR/') !== -1) ? 'Latest published version' : 'Editor\'s Draft') :
                ((spec.url.indexOf('spec.whatwg.org') !== -1) ? 'Living Standard' : 'Initial URL'))
                + '](' + (spec.latest || spec.url) + ')');
            w('- Shortname: ' + (spec.shortname || 'no shortname'));
            w();

            var report = spec.report;
            w('Potential issue(s):');
            if (report.noNormativeRefs) {
                w('- No normative references found');
            }
            if (report.noIdl) {
                w('- No IDL definitions found');
            }
            if (report.invalidIdl) {
                w('- Invalid IDL content found');
            }
            if (report.unknownIdlNames &&
                (report.unknownIdlNames.length > 0)) {
                w('- Unknown IDL names used: ' +
                    report.unknownIdlNames.join(', '));
            }
            if (report.missingReferences &&
                (report.missingReferences.length > 0)) {
                w('- Missing references for IDL names: ' + report.missingReferences.map(i => i.name).join(', '));
            }
            w();
            w();
        });
    w();
    w();
}


function generateReport(results) {
    var count = 0;
    var w = console.log.bind(console);

    w('# Reffy crawl report');
    w();

    w('## Specifications crawled');
    w();
    count = results.length;
    w('- ' + count + ' specification' + ((count > 1) ? 's' : '') + ' crawled');
    w();
    w();

    count = 0;
    w('## List of specifications without normative dependencies');
    w();
    results
        .filter(r => (!r.refs.normative || (r.refs.normative.length === 0)))
        .forEach(r => {
            count += 1;
            w('- [' + r.title + '](' + (r.latest || r.url) + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    w();
    w('**NB:** it may be normal!');
    w();
    w();

    count = 0;
    w('## List of specifications without IDL definitions');
    w();
    results
        .filter(r => ((Object.keys(r.idl).length === 0) ||
            (!r.idl.idlNames && !r.idl.message) ||
            (r.idl.idlNames && (Object.keys(r.idl.idlNames).length === 1) && (Object.keys(r.idl.idlExtendedNames).length === 0))))
        .forEach(r => {
            count += 1;
            w('- [' + r.title + '](' + (r.latest || r.url) + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    w();
    w();


    count = 0;
    w('## List of specifications with invalid IDL content');
    w();
    results
        .filter(r => (!r.idl.idlNames && r.idl.message))
        .forEach(r => {
            count += 1;
            w('- [' + r.title + '](' + (r.latest || r.url) + ')');
        });
    w();
    w('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    w();
    w('**NB:** this may be due to WebIDL having evolved in the meantime');
    w();
    w();



    count = 0;
    w('## List of IDL names not defined in the specifications crawled');
    w();
    var idlNames = results
        .map(r => r.idl && r.idl.idlNames ? Object.keys(r.idl.idlNames).filter(n => n !== "_dependencies") : [], [])
        .reduce(array_concat);
    var idlDeps = results
        .map(r => r.idl && r.idl.externalDependencies ? r.idl.externalDependencies : [], [])
        .reduce(array_concat)
        .filter(array_unique);
    var diff = idlDeps.filter(n => idlNames.indexOf(n) === -1);
    count = diff.length;
    diff.forEach(idlName => w('- ' + idlName));
    w();
    w('=> ' + count + ' IDL name' + ((count > 1) ? 's' : '') + ' found');
    w();
    w('NB: some of them are likely type errors in specs');
    w('(e.g. "int" does not exist, "Array" cannot be used on its own, etc.)');
    w();
    w();

    count = 0;
    w('## List of IDL names defined in more than one spec');
    w();
    var dup = idlNames.filter((n, i, a) => a.indexOf(n) !== i);
    count = dup.length;
    dup.forEach(idlName => w('- ' + idlName));
    w();
    w('=> ' + count + ' IDL name' + ((count > 1) ? 's' : '') + ' found');
}


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var specResultsPath = process.argv[2];
    var perSpec = !!process.argv[3];
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
    if (perSpec) {
        console.log(generateReportPerSpec(specResults));
    }
    else {
        console.log(generateReport(specResults));
    }
}
