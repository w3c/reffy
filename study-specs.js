var array_concat = (a,b) => a.concat(b);
var array_unique = (n, i, a) => a.indexOf(n) === i;

function processResults(results) {
    var count = 0;
    var write = console.log.bind(console);

    write('Specifications crawled');
    write('======================');
    count = results.length;
    write('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' crawled');
    write();
    write();

    count = 0;
    write('List of specifications without normative dependencies');
    write('=====================================================');
    results
        .filter(r => (!r.refs.normative || (r.refs.normative.length === 0)))
        .forEach(r => {
            count += 1;
            write(r.url)
        });
    write();
    write('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    write();
    write('NB: it may be normal!');
    write();
    write();

    count = 0;
    write('List of specifications without IDL definitions')
    write('==============================================');
    results
        .filter(r => ((Object.keys(r.idl).length === 0) ||
            (!r.idl.idlNames && !r.idl.message) ||
            (r.idl.idlNames && (Object.keys(r.idl.idlNames).length === 1) && (Object.keys(r.idl.idlExtendedNames).length === 0))))
        .forEach(r => {
            count += 1;
            write(r.url)
        });
    write();
    write('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    write();
    write();


    count = 0;
    write('List of specifications with invalid IDL content')
    write('===============================================');
    results
        .filter(r => (!r.idl.idlNames && r.idl.message))
        .forEach(r => {
            count += 1;
            write(r.url)
        });
    write();
    write('=> ' + count + ' specification' + ((count > 1) ? 's' : '') + ' found');
    write();
    write('NB: this may be due to WebIDL having evolved in the meantime');
    write();
    write();



    count = 0;
    write('List of IDL names not defined in the specifications crawled');
    write('===========================================================');
    var idlNames = results
        .map(r => r.idl && r.idl.idlNames ? Object.keys(r.idl.idlNames).filter(n => n !== "_dependencies") : [], [])
        .reduce(array_concat)
    var idlDeps = results
        .map(r => r.idl && r.idl.externalDependencies ? r.idl.externalDependencies : [], [])
        .reduce(array_concat)
        .filter(array_unique);
    var diff = idlDeps.filter(n => idlNames.indexOf(n) === -1);
    count = diff.length;
    diff.forEach(idlName => write(idlName));
    write();
    write('=> ' + count + ' IDL name' + ((count > 1) ? 's' : '') + ' found');
    write();
    write('NB: some of them are likely type errors in specs');
    write('(e.g. "int" does not exist, "Array" cannot be used on its own, etc.)');
    write();
    write();

    count = 0;
    write('List of IDL names defined in more than one spec');
    write('===============================================');
    var dup = idlNames.filter((n, i, a) => a.indexOf(n) !== i);
    count = dup.length;
    dup.forEach(idlName => write(idlName));
    write();
    write('=> ' + count + ' IDL name' + ((count > 1) ? 's' : '') + ' found');
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
