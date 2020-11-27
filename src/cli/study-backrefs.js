#!/usr/bin/env node
const requireFromWorkingDirectory = require('../lib/util').requireFromWorkingDirectory;
const canonicalizeUrl = require('../../builds/canonicalize-url').canonicalizeUrl;
const canonicalizesTo = require('../../builds/canonicalize-url').canonicalizesTo;
// FIXME
const computeShortName = require('../../../browser-specs/src/compute-shortname');
const fs = require("fs");

const matchSpecUrl = url => url.match(/spec.whatwg.org/) || url.match(/www.w3.org\/TR\/[a-z0-9]/) || (url.match(/.github.io/) && ! url.match(/w3c.github.io\/test-results\//));

// TODO
// report broken links based on crawled ids

// shortnames for specs that should no longer be linked to
const shortNamesOfOutdatedSpecs = {
  "html52": "https://html.spec.whatwg.org/",
  "html51": "https://html.spec.whatwg.org/",
  "html5": "https://html.spec.whatwg.org/",
  "html50": "https://html.spec.whatwg.org/",
  "domcore": "https://dom.spec.whatwg.org/",
  "2dcontext": "https://html.spec.whatwg.org/",
  "2dcontext2": "https://html.spec.whatwg.org/",
  "worklets-1": "https://html.spec.whatwg.org/",
  "workers": "https://html.spec.whatwg.org/",
  "webstorage": "https://html.spec.whatwg.org/",
  "custom-elements": "https://html.spec.whatwg.org/",
  "selectors-api": "https://dom.spec.whatwg.org/",
  "websockets": "https://html.spec.whatwg.org/",
  "eventsource": "https://html.spec.whatwg.org/",
  "webmessaging": "https://html.spec.whatwg.org/",
  "cors":  "https://fetch.spec.whatwg.org/",
};

const shortnameMap = {
  "mixedcontent": "mixed-content",
  "powerfulfeatures": "secure-contexts",
  "hr-time-2": "hr-time",
  "csp": "CSP",
  "CSP2": "CSP",
  "content-security-policy": "CSP",
  "feature-policy": "permissions-policy",
  "css2": "CSS21",
  "css-contain-1": "css-contain",
  "css3-background": "css-backgrounds",
  "css3-break": "css-break",
  "css3-color": "css-color",
  "css-color-3": "css-color",
  "css3-align": "css-align",
  "css3-box": "css-box",
  "css3-flexbox": "css-flexbox",
  "css3-fonts": "css-fonts",
  "css-fonts-3": "css-fonts",
  "css3-grid-layout": "css-grid",
  "css-grid-1": "css-grid",
  "css3-animations": "css-animations",
  "css3-images": "css-images",
  "css3-mediaqueries": "mediaqueries",
  "css3-multicol": "css-multicol",
  "css3-namespace": "css-namespaces",
  "css3-page": "css-page",
  "css3-positioning": "css-position",
  "css3-regions": "css-regions",
  "css3-speech": "css-speech",
  "css3-syntax": "css-syntax",
  "css3-transforms": "css-transforms",
  "css-ui-3": "css-ui",
  "css3-text": "css-text",
  "css3-transitions": "css-transitions",
  "css3-values": "css-values",
  "css3-writing-modes": "css-writing-modes",
  "css-writing-modes-3": "css-writing-modes",
  "css3-selectors": "selectors",
  "css-selectors-3": "selectors",
  "selectors-3": "selectors",
  "css-selectors": "selectors",
  "selectors4": "selectors",
  "webdriver1": "webdriver2",
  "webdriver": "webdriver2",
  "resource-timing": "resource-timing-2",
  "html-aam": "html-aam-1.0",
  "ServiceWorker": "service-workers",
  "BackgroundSync": "background-sync",
  "InputDeviceCapabilities": "input-device-capabilities",
  "IntersectionObserver": "intersection-observer",
  "wasm-core-1": "wasm-core",
  "pointerevents2": "pointerevents",
  "input-events-1": "input-events",
  "accname-aam-1.1": "accname",
  "core-aam-1.1": "core-aam",
  "accname-1.1": "accname",
  "webauthn-1": "webauthn",
  "resource-timing-1": "resource-timing",
  "wai-aria-1.1": "wai-aria-1.2"
};

// TODO: check the link is non-normative (somehow)
const shortnameOfNonNormativeDocs = [
  "aria-practices", "rdf11-primer", "discovery-api", "wake-lock-use-cases", "capability-urls", "streamproc", "media-source-testcoverage", "using-aria", "wai-aria-practices-1.1", "sensor-polyfills", "sensors", "design-principles", "security-questionnaire", "css3-preslev", "clreq", "klreq", "typography", "ssml-sayas", "css3-marquee", "spatial-navigation", "ilreq", "css-print", "books", "dpub-pagination", "predefined-counter-styles", "css-2017", "sniffly", "wai-aria-practices-1.2", "wai-aria-implementation", "wai-aria-roadmap", "wai-aria-practices", "webdatabase", "installable-webapps", "motion-sensors", "file-system-api", "media-accessibility-reqs", "webrtc-interop-reports", "webaudio-usecases", "web-audio-perf", "Audio-EQ-Cookbook", "web-intents", "touch-events-extensions", "fingerprinting-guidance", "webrtc-nv-use-cases", "html-design-principles", "storage-partitioning", "jlreq", "accept-encoding-range-test", "security-privacy-questionnaire", "dpub-latinreq"
];

const report = {};

function recordAnomaly(spec, anomalyType, link) {
  if (!report[spec.url]) {
    report[spec.url] = {
      title: spec.title,
      notExported: [],
      notDfn: [],
      brokenLink: [],
      outdatedSpec: [],
      unknownSpec: [],
      datedUrl: []
    };
  }
  report[spec.url][anomalyType].push(link);
}

const missingSpecs = {};

function recordUnknownSpec(link, shortname, spec) {
  if (!missingSpecs[shortname]) {
    missingSpecs[shortname] = [];
  }
  missingSpecs[shortname].push({link, spec: spec.url});
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
              // Ignore links to previous versions
              if (m[1] !== spec.shortname) {
                recordAnomaly(spec, "datedUrl", l);
              }
            } else {
              recordAnomaly(spec, "unknownSpec", l);
            }
          }
        }
        if (shortnameMap[shortname]) {
          shortname = shortnameMap[shortname];
        } else if (shortNamesOfOutdatedSpecs[shortname]) {
          recordAnomaly(spec, "outdatedSpec", l);
        }
        if (!shortname) { return ;}
        // self-references might be broken because of ed vs tr
        if (shortname === spec.shortname || shortname === spec.series.shortname) return [];
        let sourceSpec = results.find(s => s.shortname === shortname || s.series.shortname === shortname);
        if (!sourceSpec) {
          if (shortname && !shortNamesOfOutdatedSpecs[shortname] && !shortnameOfNonNormativeDocs.includes(shortname)) {
            recordUnknownSpec(l, shortname, spec)
          }
          return;
        }
        let headings = sourceSpec.headings || [];
        let dfns = sourceSpec.dfns || [];
        let ids = sourceSpec.ids || [];
        if (!dfns.length) {
          if (fs.existsSync("../webref/ed/dfns/" + shortname + ".json")) {
            dfns = JSON.parse(fs.readFileSync("../webref/ed/dfns/" + shortname + ".json", "utf-8")).dfns;
          }
          if (fs.existsSync("../webref/tr/dfns/" + shortname + ".json")) {
            dfns = dfns.concat(JSON.parse(fs.readFileSync("../webref/ed/dfns/" + shortname + ".json", "utf-8")).dfns);
          }
          if (!dfns.length) {
            recordUnknownSpec(l, shortname, spec)
            return;
          }
        }

        // anchors
        const anchors = spec.links[l];
        for(let anchor of anchors) {
          let id = ids.includes(anchor);
          let heading = headings.find(h => h.id === anchor);
          let dfn = dfns.find(d => d.id === anchor);
          if (!id) {
            recordAnomaly(spec, "brokenLink", l + "#" + anchor);
          } else if (!heading && !dfn) {
            recordAnomaly(spec, "notDfn", l + "#" + anchor);
          } else if (dfn && dfn.access !== "public") {
            recordAnomaly(spec, "notExported", l  + "#" + anchor);
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
    report += `<details><summary><a href="${s}">${results[s].title}</a></summary>\n\n`;
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
    if (results[s].datedUrl.length) {
      report += "Links to dated TR URLs:\n"
      results[s].datedUrl.forEach(l => {
        report += "* " + l + "\n";
      })
      report += "\n\n";
    }
    if (results[s].outdatedSpec.length) {
      report += "Links to specs that should no longer be referenced:\n"
      results[s].outdatedSpec.forEach(l => {
        report += "* " + l + "\n";
      })
      report += "\n\n";
    }
    if (results[s].unknownSpec.length) {
      report += "Links to things that look like specs but that aren't recognized in reffy data:\n"
      results[s].unknownSpec.forEach(l => {
        report += "* " + l + "\n";
      })
      report += "\n\n";
    }
    report += "</details>\n";
  });
  console.log(report);
  console.error(JSON.stringify(missingSpecs, null, 2));
}
