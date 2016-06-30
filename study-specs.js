var array_concat = (a,b) => a.concat(b);
var array_unique = (n, i, a) => a.indexOf(n) === i;

function processResults(results) {
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
        .reduce(array_concat)
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
    processResults(specResults);
}
