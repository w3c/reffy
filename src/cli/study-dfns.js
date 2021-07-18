#!/usr/bin/env node
/**
 * The definitions analyzer takes links to a crawl folder and creates a report
 * that lists:
 *
 * - Exported definitions that appear in more than one spec
 *
 * The definitions analyzer can be called directly through:
 *
 * `node study-dfns.js [crawl folder]`
 *
 * where `crawl folder` is the path to the root folder that contains the result
 * of a crawl.
 *
 * @module dfns
 */

const {expandCrawlResult, requireFromWorkingDirectory} = require("../lib/util");
const path = require("path");


function studyDfns(edResults, specUrls) {
  const report = [];

  const allDfns = new Map();
  edResults
    .filter(spec => !!spec.dfns)
    .filter(spec => spec.shortname === spec.series.currentSpecification)
    .forEach(spec =>
      spec.dfns.forEach(dfn => {
        if ((dfn.access !== 'public') || dfn.for.length) {
          return;
        }
        dfn.spec = {
          shortname: spec.shortname,
          url: spec.url,
          title: spec.title
        };
        dfn.linkingText.forEach(text => {
          const dfns = allDfns.get(text);
          if (dfns) {
            dfns.push(dfn);
          }
          else {
            allDfns.set(text, [dfn]);
          }
        })
      }));

  const total = { unique: 0, dupl: 0, all: 0 };
  allDfns.forEach((dfns, term) => {
    total.unique += 1;
    let exported = dfns;

    // CSS Module > CSS 2
    if (exported.find(dfn => dfn.spec.shortname.startsWith('CSS2')) &&
        exported.find(dfn =>
          dfn.spec.shortname.startsWith('css-') ||
          dfn.spec.shortname.startsWith('selectors-') ||
          dfn.spec.shortname.startsWith('fill-stroke-'))) {
      exported = exported.filter(dfn => !dfn.spec.shortname.startsWith('CSS2'));
    }

    // CSS Module > SVG 2
    if (exported.find(dfn => dfn.spec.shortname === 'SVG2') &&
        exported.find(dfn =>
          dfn.spec.shortname.startsWith('css-') ||
          dfn.spec.shortname.startsWith('selectors-') ||
          dfn.spec.shortname.startsWith('fill-stroke-'))) {
      exported = exported.filter(dfn => dfn.spec.shortname !== 'SVG2');
    }

    // css-align > css-flexbox
    if (exported.find(dfn => dfn.spec.shortname.startsWith('css-align-')) &&
        exported.find(dfn => dfn.spec.shortname.startsWith('css-flexbox-'))) {
      exported = exported.filter(dfn => !dfn.spec.shortname.startsWith('css-flexbox-'));
    }

    // css-position > css-logical
    if (exported.find(dfn => dfn.spec.shortname.startsWith('css-position-')) &&
        exported.find(dfn => dfn.spec.shortname.startsWith('css-logical-'))) {
      exported = exported.filter(dfn => !dfn.spec.shortname.startsWith('css-logical-'));
    }

    // Ignore duplicate IDL terms (handled by IDL patches)
    const idlTypes = [
      'argument', 'attribute', 'callback', 'const', 'constructor',
      'dict-member', 'dictionary', 'enum', 'enum-value', 'exception',
      'extended-attribute', 'interface', 'iterator', 'maplike', 'method',
      'namespace', 'serializer', 'setlike', 'stringifier', 'typedef'
    ];
    if (idlTypes.includes(exported[0].type) &&
        exported.every(dfn => dfn.type === exported[0].type)) {
      exported = exported.slice(0, 1);
    }

    // Ignore duplicate elements in HTML and SVG 2 (a, link, style, title)
    if (exported.length === 2 &&
        exported.every(dfn => dfn.type === 'element') &&
        exported.find(dfn => dfn.spec.shortname === 'html') &&
        exported.find(dfn => dfn.spec.shortname === 'SVG2')) {
      exported = exported.filter(dfn => dfn.spec.shortname === 'html');
    }

    total.all += exported.length;
    if (exported.length > 1) {
      total.dupl += 1;
      report.push({
        name: term,
        total: exported.length,
        dfns: exported
      });
    }
  });
  console.warn(`Number of definitions: ${total.all}`);
  console.warn(`Number of terms defined: ${total.unique}`);
  console.warn(`Terms defined more than once: ${total.dupl}`);

  report.sort((first, second) => {
    const name1 = first.name.toUpperCase();
    const name2 = second.name.toUpperCase();
    if (name1 < name2) {
      return -1;
    }
    else if (name1 > name2) {
      return 1;
    }
    else {
      return 0;
    }
  });
  return report;
}


async function loadCrawlResults(crawlResultsPath) {
  let crawlResults;
  try {
    crawlResults = requireFromWorkingDirectory(crawlResultsPath);
  } catch(e) {
    throw "Impossible to read " + crawlResultsPath + ": " + e;
  }

  crawlResults = await expandCrawlResult(crawlResults, crawlResultsPath.replace(/index\.json$/, ''));
  return crawlResults.results
}

function reportToConsole(report) {
  const sameType = report.filter(dfn => dfn.dfns.every(d => d.type === dfn.dfns[0].type));
  console.log('<details>');
  console.log(`<summary><b>Duplicate dfns with same type</b> (${sameType.length} found)</summary>`);
  console.log();
  sameType.forEach(dfn => {
    const specs = dfn.dfns.map(d => `[${d.spec.title}](${d.href})`).join(', ');
    console.log(`- \`${dfn.name}\`: ${specs}`);
  });
  console.log('</details>');
  console.log();

  const differentType = report.filter(dfn => dfn.dfns.some(d => d.type !== dfn.dfns[0].type));
  console.log('<details>');
  console.log(`<summary><b>Duplicate dfns with different types</b> (${differentType.length} found)</summary>`);
  console.log();
  differentType.forEach(dfn => {
    const specs = dfn.dfns.map(d => `[${d.spec.title}](${d.href})`).join(', ');
    console.log(`- \`${dfn.name}\`: ${specs}`);
  });
  console.log('</details>');
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.studyDfns = studyDfns;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
  let crawlResultsPath = process.argv[2];
  const specUrls = process.argv[3] ? process.argv[3].split(',') : [];

  if (!crawlResultsPath) {
    console.error("Required crawl results parameter missing");
    process.exit(2);
  }

  // Analyze the crawl results
  loadCrawlResults(crawlResultsPath)
    .then(crawl => studyDfns(crawl, specUrls))
    .then(reportToConsole)
    .catch(e => {
      console.error(e);
      process.exit(3);
    });
}
