#!/usr/bin/env node
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const canonicalizeUrl = require('../../builds/canonicalize-url').canonicalizeUrl;
const canonicalizesTo = require('../../builds/canonicalize-url').canonicalizesTo;
const computeShortName = require('../../../browser-specs/src/compute-shortname');
const fs = require("fs");

const matchSpecUrl = url => url.match(/spec.whatwg.org/) || url.match(/www.w3.org\/TR\/[a-z0-9]/) || (url.match(/.github.io/) && ! url.match(/w3c.github.io\/test-results\//));
const missingSpecs = {};

// TODO
// dated URLs
// report outdated shortnames
// crawl all ids and report broken links

// shortnames for specs that should no longer be linked to
const shortNamesOfOutdatedSpecs = {
  "html51": "https://html.spec.whatwg.org/",
  "html5": "https://html.spec.whatwg.org/",
  "html50": "https://html.spec.whatwg.org/",
  "domcore": "https://dom.spec.whatwg.org/",
};

const shortnameMap = {
  "hr-time-2": "hr-time",
  "csp": "CSP",
  "css3-background": "css-backgrounds",
  "css3-break": "css-break",
  "css3-color": "css-color",
  "css3-flexbox": "css-flexbox",
  "css3-fonts": "css-fonts",
  "css3-grid-layout": "css-grid",
  "css3-images": "css-images",
  "css3-mediaqueries": "mediaqueries",
  "css3-multicol": "css-multicol",
  "css3-namespace": "css-namespaces",
  "css3-page": "css-page",
  "css3-positioning": "css-position",
  "css3-regions": "css-regions",
  "css3-speech": "css-speech",
  "css3-syntax": "css-syntax",
  "css3-text": "css-text",
  "css3-transitions": "css-transitions",
  "css3-values": "css-values",
  "css3-writing-modes": "css-writing-modes",
  "css3-selectors": "selectors",
  "css-selectors-3": "selectors",
  "css-selectors": "selectors",
  "selectors4": "selectors",
  // error in latest crawl
  "webdriver": "webdriver2",
  "resource-timing": "resource-timing-2",
  "html-aam": "html-aam-1.0"
};

const report = {};

function recordAnomaly(spec, anomalyType, link) {
  if (!report[spec]) {
    report[spec] = {
      notExported: [],
      notDfn: [],
      unknownSpec: []
    };
  }
  report[spec][anomalyType].push(link);
}

function studyCrawlResults(results) {
  results.forEach(spec => {
    Object.keys(spec.links)
      .filter(matchSpecUrl)
      .forEach(l => {
        let shortname;
        let nakedLink = l.replace(/#.*$/, '');
        if (nakedLink.endsWith(".html")) {
          nakedLink = nakedLink.replace(/\/[^/]*\.html/, '/');
        }
        if (nakedLink[nakedLink.length - 1] !== '/') {
          nakedLink += '/';
        }
        shortname = (results.find(r => r.url === nakedLink || (r.release && r.release.url === nakedLink) || r.nightly.url === nakedLink || (r.series && nakedLink === 'https://www.w3.org/TR/' + r.series.shortname + '/') ) || {}).shortname;
        if (!shortname) {
          try {
            ({shortname} = computeShortName(l));
          } catch (e) {
            let m = l.match(/www\.w3\.org\/TR\/[0-9]{4}\/[A-Z]+-(.+)-[0-9]{8}/);
            if (m) {
              shortname = m[1];
            } else {
              recordAnomaly(spec.url, "unknownSpec", l);
              return;
            }
          }
        }
        if (shortnameMap[shortname]) {
          shortname = shortnameMap[shortname];
        }
        // self-references might be broken because of ed vs tr
        if (shortname === spec.shortname || shortname === spec.series.shortname) return [];
        // anchors
        const anchors = spec.links[l];
        for(let anchor of anchors) {
          let sourceSpec = results.find(s => s.shortname === shortname || s.series.shortname === shortname);
          if (!sourceSpec) {
            if (!missingSpecs[shortname]) {
              //report.push("No data crawled for " + shortname + " referenced in " + spec.url);
              missingSpecs[shortname] = true;
            }
            continue;
          }
          let headings = sourceSpec.headings || [];
          let dfns = sourceSpec.dfns || [];
          if (!dfns.length) {
            if (fs.existsSync("../webref/ed/dfns/" + shortname + ".json")) {
              dfns = JSON.parse(fs.readFileSync("../webref/ed/dfns/" + shortname + ".json", "utf-8")).dfns;
            }
            if (fs.existsSync("../webref/tr/dfns/" + shortname + ".json")) {
              dfns = dfns.concat(JSON.parse(fs.readFileSync("../webref/ed/dfns/" + shortname + ".json", "utf-8")).dfns);
            }
            if (!dfns.length) {
              //report.push("No definitions crawled for " + shortname + " referenced in " + spec.url);
              missingSpecs[shortname] = true;
              continue;
            }
          }
          let heading = headings.find(h => h.id === anchor);
          let dfn = dfns.find(d => d.id === anchor);
          if (!heading && !dfn) {
            recordAnomaly(spec.url, "notDfn", l + "#" + anchor);
          }
          if (dfn && dfn.access !== "public") {
            recordAnomaly(spec.url, "notExported", l  + "#" + anchor);

          }
        }
      });
  });
  return report;
}


if (require.main === module) {
  const crawlResultsPath = process.argv[2];

  if (!crawlResultsPath) {
    console.error("Required crawl results parameter missing");
    process.exit(2);
  }

  let crawlResults;
  try {
    crawlResults = requireFromWorkingDirectory(crawlResultsPath);
  } catch(e) {
    console.error("Impossible to read " + crawlResultsPath + ": " + e);
    process.exit(3);
  }

  const results = studyCrawlResults(crawlResults.results);
  let report = "";
  Object.keys(results).forEach(s => {
    report += "<details><summary>" + s + "</summary>\n\n";
    if (results[s].notDfn.length) {
      report += "Links to anchors that are not definitions or headings:\n"
      results[s].notDfn.forEach(l => {
        report += "* " + l + "\n";
      })
      report += "\n\n";
    }
    if (results[s].notExported.length) {
      report += "Links to definitions that are not exported:\n"
      results[s].notExported.forEach(l => {
        report += "* " + l + "\n";
      })
      report += "\n\n";
    }
    if (results[s].unknownSpec.length) {
      report += "Links to things that look like specs but that aren't recognized in reffy data::\n"
      results[s].unknownSpec.forEach(l => {
        report += "* " + l + "\n";
      })
      report += "\n\n";
    }
    report += "</details>\n";
  });
  console.log(report);
  console.error(JSON.stringify(Object.keys(missingSpecs).sort(), null, 2));
}
