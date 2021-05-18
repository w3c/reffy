const fs = require('fs');
const path = require('path');
const fetch = require('../lib/util').fetch;
const browserSpecs = require('browser-specs');
const {crawlSpecs} = require('./crawl-specs'); // TODO mv to lib? util?
const {processSpecification, requireFromWorkingDirectory} = require('../lib/util');

async function extractEditorFromSpec(spec) {
    spec.date = "";
    if (spec.error) {
        return spec;
    }

    try {
        const result = await processSpecification(spec, (spec) => {
            return {
                crawled: window.location.toString(),
                title: window.reffy.getTitle(),
                generator: window.reffy.getGenerator(),
                date: window.reffy.getLastModifiedDate(),
                editors: window.reffy.extractEditors()
            };
        }, [spec]);

        return result;
    }
    catch (err) {
        spec.title = spec.title || '[Could not be determined, see error]';
        spec.error = err.toString() + (err.stack ? ' ' + err.stack : '');
    }

    return spec;
}


function processSpecs(specList, resultsPath) {
    if (!resultsPath) {
        return Promise.reject('Required folder parameter missing');
    }
    try {
        fs.writeFileSync(path.join(resultsPath, 'index.json'), '');
    } catch (err) {
        return Promise.reject('Impossible to write to ' + resultsPath + ': ' + err);
    }

    return crawlSpecs(specList, extractEditorFromSpec)
        .then(results => fs.promises.writeFile(path.join(resultsPath, 'index.json'), JSON.stringify(results, null, 2)));
}

/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var specList = process.argv[2];
    var resultsPath = process.argv[3];

    if (specList === '') {
        // Use nightly specs.
        specList = browserSpecs.map(s => Object.assign({}, s, { url: s.nightly?.url ?? s.url }));
    } else {
        specList = requireFromWorkingDirectory(specList).map(s => { return { url: s }; });
    }

    // Process the file and crawl specifications it contains
    processSpecs(specList, resultsPath)
        .then(_ => {
            console.log('Finished');
            process.exit(0);
        })
        .catch(err => {
            console.error(err);
            process.exit(1);
        });
}
