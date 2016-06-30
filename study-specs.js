var array_concat = (a,b) => a.concat(b);
var array_unique = (n, i, a) => a.indexOf(n) === i;

function processResults(results) {
    results.filter(r => !r.refs.normative || r.refs.normative.length === 0).forEach(r => console.error(r.url + " has no normative dependency"));
    results.filter(r => Object.keys(r.idl).length === 0 || !r.idl.idlNames || (Object.keys(r.idl.idlNames).length === 1 && Object.keys(r.idl.idlExtendedNames).length === 0)).forEach(r => console.error(r.url + " has no IDL"));
    var idlNames = results.map(r =>  r.idl && r.idl.idlNames ? Object.keys(r.idl.idlNames).filter(n => n !== "_dependencies") : [], []).reduce(array_concat).filter(array_unique);
    var idlDeps = results.map(r =>  r.idl && r.idl.externalDependencies ? r.idl.externalDependencies : [], []).reduce(array_concat).filter(array_unique);
    var diff = idlDeps.filter(n => idlNames.indexOf(n) === -1);
    console.log(diff);
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
