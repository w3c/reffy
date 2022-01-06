#!/usr/bin/env node
/**
 * The parsed IDL generator takes a crawl report or a single spec as input, and
 * generates (or re-generates if it already exists) a parsed IDL structure from
 * the raw IDL that the spec defines. Result is dumped to the console or saved
 * to the given folder.
 * 
 * The parsed IDL generator is used by the crawler to create and save the parsed
 * IDL structures. It is also useful to re-generated the parsed IDL info when
 * an IDL patch has been applied to the raw IDL.
 *
 * The parsed IDL generator can be called directly through:
 *
 * `node generate-idlparsed.js [crawl report] [save folder]`
 *
 * where `crawl report` is the path to the folder that contains the
 * `index.json` file and all other crawl results produced by specs-crawler.js,
 * and `save folder` is an optional folder (which must exist) where IDL
 * name extracts are to be saved. In the absence of this parameter, the report
 * is written to the console.
 *
 * When a folder is provided, the IDL name extracts are saved as a JSON
 * structure in an `idlparsed` subfolder.
 */

const fs = require('fs');
const path = require('path');
const webidlParser = require('../cli/parse-webidl');
const {
  expandCrawlResult,
  requireFromWorkingDirectory,
  createFolderIfNeeded
} = require('../lib/util');


/**
 * Update the spec object in place with parsed IDL information.
 * 
 * @function
 * @public
 * @param {Object} spec The spec object to update. The function looks for the
 *   raw IDL in the `idl` property.
 * @return {Object} The updated spec with an `idl` property that contains the
 *   parsed version of the IDL, and the raw IDL moved under the `idl.idl`
 *   sub-property. Note the spec object is updated in place.
 */
async function generateIdlParsed(spec) {
  if (!spec?.idl) {
    return spec;
  }
  try {
    spec.idlparsed = await webidlParser.parse(spec.idl);
    spec.idlparsed.hasObsoleteIdl = webidlParser.hasObsoleteIdl(spec.idl);
  }
  catch (err) {
    // IDL content is invalid and cannot be parsed.
    // Let's return the error, along with the raw IDL
    // content so that it may be saved to a file.
    spec.idlparsed = err;
  }
  return spec;
}


async function generateIdlParsedFromPath(crawlPath) {
  const crawlIndex = requireFromWorkingDirectory(path.resolve(crawlPath, 'index.json'));
  const crawlResults = await expandCrawlResult(crawlIndex, crawlPath, ['idl']);
  await Promise.all(crawlResults.results.map(generateIdlParsed));
  return crawlResults;
}


/**
 * Generate the `idlparsed` export for the spec.
 * 
 * Note that the raw IDL (under `spec.idl.idl`) gets deleted in the process.
 *
 * @function
 * @public
 * @param {Object} spec Spec object with the parsed IDL
 * @param {String} folder Path to root folder where `idlparsed` folder needs to
 *   appear.
 * @return {String} The relative path from the root folder to the generated file
 */
async function saveIdlParsed(spec, folder) {
  function specInfo(spec) {
    return {
      spec: {
        title: spec.title,
        url: spec.crawled
      }
    };
  }

  const subfolder = path.join(folder, 'idlparsed');
  await createFolderIfNeeded(subfolder);

  if (!spec?.idlparsed) {
    return;
  }

  const json = JSON.stringify(
    Object.assign(specInfo(spec), { idlparsed: spec.idlparsed }),
    null, 2);
  const filename = path.join(subfolder, spec.shortname + '.json');
  await fs.promises.writeFile(filename, json);
  return `idlparsed/${spec.shortname}.json`;
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.generateIdlParsed = generateIdlParsed;
module.exports.saveIdlParsed = saveIdlParsed;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
  const crawlPath = process.argv[2];
  if (!crawlPath) {
    console.error('Required path to crawl results folder is missing');
    process.exit(2);
  }

  const savePath = process.argv[3];
  generateIdlParsedFromPath(crawlPath)
    .then(report => {
      if (savePath) {
        return Promise.all(report.results.map(
          spec => saveIdlParsed(spec, savePath)));
      }
      else {
        console.log(JSON.stringify(report, null, 2));
      }
    });
}
