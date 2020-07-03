#!/usr/bin/env node
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const canonicalizeUrl = require('../../builds/canonicalize-url').canonicalizeUrl;
const canonicalizesTo = require('../../builds/canonicalize-url').canonicalizesTo;
const computeShortName = require('../../../browser-specs/src/compute-shortname');
const fs = require("fs");

const matchSpecUrl = url => url.match(/spec.whatwg.org/) || url.match(/www.w3.org\/TR\/[a-z0-9]/) || (url.match(/w3c.github.io/) && ! url.match(/w3c.github.io\/test-results\//));

const shortnameMap = {
  "html51": "html",
  "html5": "html",
  "html50": "html",
  "hr-time-2": "hr-time",
  "webrtc-pc": "webrtc",
  "csp": "CSP",
  "subresource-integrity": "SRI",
  "mediacapture-image": "image-capture",
  "mediacapture-main": "mediacapture-streams",
  "IntersectionObserver": "intersection-observer",
  "manifest": "appmanifest",
  "domcore": "dom",
  "battery": "battery-status",
  "css3-background": "css-backgrounds",
  "css3-break": "css-break",
  "css3-color": "css-color",
  "css3-flexbox": "css-flexbox",
  "css3-fonts": "css-fonts",
  "css3-grid-layout": "css-grid",
  "css3-images": "css-images",
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
  "ServiceWorker": "service-workers",
  // error in latest crawl
  "webdriver": "webdriver2",
  "resource-timing": "resource-timing-2",
  "html-aam": "html-aam-1.0"
};

function studyCrawlResults(results) {
  return results.map(spec => {
    return Object.keys(spec.links)
      .filter(matchSpecUrl)
      .map(l => {
        let shortname;
        const report = [];
        try {
          ({shortname} = computeShortName(l));
        } catch (e) {
          let m = l.match(/www\.w3\.org\/TR\/[0-9]{4}\/[A-Z]+-(.+)-[0-9]{8}/);
          if (m) {
            shortname = m[1];
          } else {
            report.push("No shortname found for " + l + " referenced in " + spec.url);
            return report;
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
            report.push("No data crawled for " + shortname + " referenced in " + spec.url);
            continue;
          }
          let headings = sourceSpec.headings || [];
          let dfns = sourceSpec.dfns;
          if (!dfns) {
            if (fs.existsSync("../reffy-reports/ed/dfns/" + shortname + ".json")) {
              dfns = JSON.parse(fs.readFileSync("../reffy-reports/ed/dfns/" + shortname + ".json", "utf-8")).dfns;
            } else {
              report.push("No definitions crawled for " + shortname + " referenced in " + spec.url);
              continue;
            }
          }
          let heading = headings.find(h => h.id === anchor);
          let dfn = dfns.find(d => d.id === anchor);
          if (!heading && !dfn) {
            report.push("Anchor " + anchor + " of " + shortname + " found in " + spec.url + " is not a definition nor a heading");
            continue;
          }
          if (dfn && dfn.access !== "public") {
            report.push("Anchor " + anchor + " of " + shortname + " found in " + spec.url + " is not an exported definition");
          }
        }
        return report;
      })
  });
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
  console.log(JSON.stringify(results, null, 2));
}
