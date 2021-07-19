#!/usr/bin/env node
/**
 * The backrefs analyzer takes links to a ED crawl folder and a TR crawl folder,
 * and creates a report that lists, for each spec:
 *
 * - Links to anchors that do not exist
 * - Links to anchors that no longer exist in the ED of the target spec
 * - Links to anchors that are not definitions or headings
 * - Links to definitions that are not exported
 * - Links to dated TR URLs
 * - Links to specs that should no longer be referenced
 * - Links to documents that look like specs but are unknown in Reffy
 *   (likely not an anomaly per se)
 *
 * It also flags links that look like specs but that do not appear in the crawl
 * (most of these should be false positives).
 *
 * The backrefs analyzer can be called directly through:
 *
 * `node study-backrefs.js [root crawl folder]`
 *
 * where `root crawl folder` is the path to the root folder that contains `ed`
 * and `tr` subfolders. Alternatively, the analyzer may be called with two
 * arguments, one being the path to the ED crawl folder, another being the path
 * to the TR crawl folder.
 *
 * @module backrefs
 */

const {expandCrawlResult, requireFromWorkingDirectory} = require("../lib/util");
const path = require("path");

/**
 * The backrefs analyzer only checks links to other specs. This function returns
 * true when a link does target a spec, and false if it targets something else
 * (e.g. a test suite, a wiki page, an issue, etc.)
 *
 * TODO: Consider matching specs from the Khronos Group (but note there are
 * different types of resources under www.khronos.org0)
 * TODO: Consider matching TC39 specs... once we have dfns and IDs for them!
 */
const matchSpecUrl = url =>
  url.match(/spec\.whatwg\.org/) ||
  url.match(/www\.w3\.org\/TR\/[a-z0-9]/) ||

  // CSS drafts tend to link to various non-spec resources under *.csswg.org
  // (e.g. log.csswg.org or wiki.csswg.org)
  url.match(/(?<!log|hg|test|wiki)\.csswg\.org(?!\/issues)/) ||
  url.match(/\.fxtf\.org/) ||
  url.match(/\.css-houdini\.org/) ||

  url.match(/\.svgwg\.org/) ||
  (url.match(/\.github\.io/) && !url.match(/w3c\.github\.io\/test-results\//));

/*
 TODO: DRY
 Copied from browser-specs/src/compute-shortname.js
*/
function computeShortname(url) {
  function parseUrl(url) {
    // Handle /TR/ URLs
    const w3cTr = url.match(/^https?:\/\/(?:www\.)?w3\.org\/TR\/([^\/]+)\/$/);
    if (w3cTr) {
      return w3cTr[1];
    }

    // Handle WHATWG specs
    const whatwg = url.match(/\/\/(.+)\.spec\.whatwg\.org\/?/);
    if (whatwg) {
        return whatwg[1];
    }

    // Handle TC39 Proposals
    const tc39 = url.match(/\/\/tc39\.es\/proposal-([^\/]+)\/$/);
    if (tc39) {
        return "tc39-" + tc39[1];
    }


    // Handle Khronos extensions
    const khronos = url.match(/https:\/\/www\.khronos\.org\/registry\/webgl\/extensions\/([^\/]+)\/$/);
    if (khronos) {
        return khronos[1];
    }

    // Handle extension specs defined in the same repo as the main spec
    // (e.g. generate a "gamepad-extensions" name for
    // https://w3c.github.io/gamepad/extensions.html")
    const ext = url.match(/\/.*\.github\.io\/([^\/]+)\/(extensions?)\.html$/);
    if (ext) {
      return ext[1] + '-' + ext[2];
    }

    // Handle draft specs on GitHub, excluding the "webappsec-" prefix for
    // specifications developed by the Web Application Security Working Group
    const github = url.match(/\/.*\.github\.io\/(?:webappsec-)?([^\/]+)\//);
    if (github) {
        return github[1];
    }

    // Handle CSS WG specs
    const css = url.match(/\/drafts\.(?:csswg|fxtf|css-houdini)\.org\/([^\/]+)\//);
    if (css) {
      return css[1];
    }

    // Handle SVG drafts
    const svg = url.match(/\/svgwg\.org\/specs\/(?:svg-)?([^\/]+)\//);
    if (svg) {
      return "svg-" + svg[1];
    }

    // Return name when one was given
    if (!url.match(/\//)) {
      return url;
    }

    throw `Cannot extract meaningful name from ${url}`;
  }

  // Parse the URL to extract the name
  const name = parseUrl(url);

  // Make sure name looks legit, in other words that it is composed of basic
  // Latin characters (a-z letters, digits, underscore and "-"), and that it
  // only contains a dot for fractional levels at the end of the name
  // (e.g. "blah-1.2" is good but "blah.blah" and "blah-3.1-blah" are not)
  if (!name.match(/^[\w\-]+((?<=\-\d+)\.\d+)?$/)) {
    throw `Specification name contains unexpected characters: ${name} (extracted from ${url})`;
  }

  return name;
}


// shortnames for specs that should no longer be linked to
const shortNamesOfOutdatedSpecs = {
  "2dcontext": "html",
  "2dcontext2": "html",
  "cors":  "fetch",
  "custom-elements": "html",
  "domcore": "dom",
  "eventsource": "html",
  "html5": "html",
  "html50": "html",
  "html51": "html",
  "html52": "html",
  "selectors-api": "dom",
  "webmessaging": "html",
  "websockets": "html",
  "webstorage": "html",
  "workers": "html",
  "worklets-1": "html"
};

const shortnameMap = {
  "accname-1.1": "accname",
  "accname-aam-1.1": "accname",
  "BackgroundSync": "background-sync",
  "content-security-policy": "CSP",
  "core-aam-1.1": "core-aam",
  "csp": "CSP",
  "CSP2": "CSP",
  "css-color-3": "css-color",
  "css-contain-1": "css-contain",
  "css-fonts-3": "css-fonts",
  "css-grid-1": "css-grid",
  "css-selectors": "selectors",
  "css-selectors-3": "selectors",
  "css-ui-3": "css-ui",
  "css-writing-modes-3": "css-writing-modes",
  "css2": "CSS21",
  "css3-align": "css-align",
  "css3-animations": "css-animations",
  "css3-background": "css-backgrounds",
  "css3-box": "css-box",
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
  "css3-selectors": "selectors",
  "css3-speech": "css-speech",
  "css3-syntax": "css-syntax",
  "css3-text": "css-text",
  "css3-transforms": "css-transforms",
  "css3-transitions": "css-transitions",
  "css3-values": "css-values",
  "css3-writing-modes": "css-writing-modes",
  "feature-policy": "permissions-policy",
  "hr-time-2": "hr-time",
  "html-aam": "html-aam-1.0",
  "input-events-1": "input-events",
  "InputDeviceCapabilities": "input-device-capabilities",
  "IntersectionObserver": "intersection-observer",
  "mixedcontent": "mixed-content",
  "pointerevents2": "pointerevents",
  "powerfulfeatures": "secure-contexts",
  "resource-timing": "resource-timing-2",
  "resource-timing-1": "resource-timing",
  "selectors-3": "selectors",
  "selectors4": "selectors",
  "ServiceWorker": "service-workers",
  "wai-aria-1.1": "wai-aria-1.2",
  "wasm-core-1": "wasm-core",
  "webauthn-1": "webauthn",
  "webdriver": "webdriver2",
  "webdriver1": "webdriver2"
};

// TODO: check the link is non-normative (somehow)
const shortnameOfNonNormativeDocs = [
  "accept-encoding-range-test",
  "aria-practices",
  "Audio-EQ-Cookbook",
  "books",
  "capability-urls",
  "clreq",
  "css-2017",
  "css-print",
  "css3-marquee",
  "css3-preslev",
  "design-principles",
  "discovery-api",
  "dpub-latinreq",
  "dpub-pagination",
  "file-system-api",
  "fingerprinting-guidance",
  "html-design-principles",
  "ilreq",
  "installable-webapps",
  "jlreq",
  "klreq",
  "media-accessibility-reqs",
  "media-source-testcoverage",
  "motion-sensors",
  "predefined-counter-styles",
  "rdf11-primer",
  "security-privacy-questionnaire",
  "security-questionnaire",
  "sensor-polyfills",
  "sensors",
  "sniffly",
  "spatial-navigation",
  "ssml-sayas",
  "storage-partitioning",
  "streamproc",
  "touch-events-extensions",
  "typography",
  "using-aria",
  "wai-aria-implementation",
  "wai-aria-practices",
  "wai-aria-practices-1.1",
  "wai-aria-practices-1.2",
  "wai-aria-roadmap",
  "wake-lock-use-cases",
  "web-audio-perf",
  "web-intents",
  "webaudio-usecases",
  "webdatabase",
  "webrtc-interop-reports",
  "webrtc-nv-use-cases"
];


function studyBackrefs(edResults, trResults = []) {
  trResults = trResults || [];
  const report = {};

  function recordAnomaly(spec, anomalyType, link) {
    if (!report[spec.url]) {
      report[spec.url] = {
        title: spec.title,
        notExported: [],
        notDfn: [],
        brokenLinks: [],
        evolvingLinks: [],
        outdatedSpecs: [],
        unknownSpecs: [],
        datedUrls: []
      };
    }
    report[spec.url][anomalyType].push(link);
  }

  edResults.forEach(spec => {
    Object.keys(spec.links || {})
      .filter(matchSpecUrl)
      .forEach(link => {
        let shortname;
        let nakedLink = link;
        if (nakedLink.endsWith(".html")) {
          nakedLink = nakedLink.replace(/\/[^/]*\.html$/, '/');
        }
        if (nakedLink[nakedLink.length - 1] !== '/') {
          nakedLink += '/';
        }

        // Detect links to dated specs
        const match = nakedLink.match(/www\.w3\.org\/TR\/[0-9]{4}\/[A-Z]+-(.+)-[0-9]{8}\//);
        if (match) {
          // ED should not link to dated versions of the spec, unless it
          // voluntarily links to previous versions of itself
          if (match[1] !== spec.shortname) {
            recordAnomaly(spec, "datedUrls", link);
          }

          // TODO: consider pursuing the analysis with the non-dated version,
          // but note this may trigger some obscure broken fragment messages
          // when a fragment exists in the dated version but no longer exists
          // in the ED.
          return;
        }

        // Check whether the naked link matches any known URL in the crawl
        shortname = (edResults.find(r =>
          r.url === nakedLink ||
          (r.release && r.release.url === nakedLink) ||
          r.nightly.url === nakedLink ||
          (r.series && nakedLink === `https://www.w3.org/TR/${r.series.shortname}/`) ) || {}).shortname;

        // If it does not match any known URL, try to compute a shortname out of
        // it directly.
        if (!shortname) {
          try {
            shortname = computeShortname(nakedLink);
          }
          catch (e) {
            recordAnomaly(spec, "unknownSpecs", link);
            return;
          }
        }

        if (shortNamesOfOutdatedSpecs[shortname]) {
          // The specification should no longer be referenced.
          // In theory, we could still try to match the anchor against the
          // right spec. In practice, these outdated specs are sufficiently
          // outdated that it does not make a lot of sense to do so.
          recordAnomaly(spec, "outdatedSpecs", link);
          return;
        }

        if (shortnameMap[shortname]) {
          // TODO: Consider reporting that as a "non ideal" link.
          shortname = shortnameMap[shortname];
        }

        // At this point, we managed to associate the link with a shortname,
        // let's check whether the shortname matches a spec in the crawl,
        // matching the exact spec shortname if possible, or the series
        // shortname otherwise (in which case we'll use the current spec)
        const sourceSpec =
          edResults.find(s => s.shortname === shortname) ||
          edResults.find(s => s.series.shortname === shortname && s.series.currentSpecification === s.shortname);
        if (!sourceSpec) {
          if (!shortnameOfNonNormativeDocs.includes(shortname)) {
            recordAnomaly(spec, "unknownSpecs", link);
          }
          return;
        }

        // Self-references might be broken because of ED vs TR, ignore that
        if (shortname === spec.shortname || shortname === spec.series.shortname) {
          return;
        }

        // Look for a corresponding entry in the TR crawl, which we'll use to
        // distinguish between broken links and "evolving" links (meaning links
        // that exist in the TR version but no longer exist in the ED)
        const trSourceSpec =
          trResults.find(s => s.shortname === shortname) ||
          trResults.find(s => s.series.shortname === shortname && s.series.currentSpecification === s.shortname) ||
          {};
        const headings = sourceSpec.headings || [];
        const dfns = sourceSpec.dfns || [];
        const ids = sourceSpec.ids || [];

        // Check anchors
        const anchors = spec.links[link];
        for (let anchor of anchors) {
          const isKnownId = ids.includes(sourceSpec.nightly.url + "#" + anchor);
          const heading = headings.find(h => h.id === anchor);
          const dfn = dfns.find(d => d.id === anchor);
          if (!isKnownId) {
            if ((trSourceSpec.ids || []).includes(anchor) && link.match(/w3\.org\/TR\//)) {
              recordAnomaly(spec, "evolvingLinks", link + "#" + anchor);
            } else {
              recordAnomaly(spec, "brokenLinks", link + "#" + anchor);
            }
          } else if (!heading && !dfn) {
            recordAnomaly(spec, "notDfn", link + "#" + anchor);
          } else if (dfn && dfn.access !== "public") {
            recordAnomaly(spec, "notExported", link  + "#" + anchor);
          }
        }
      });
  });
  return report;
}


async function loadCrawlResults(edCrawlResultsPath, trCrawlResultsPath) {
  let edCrawlResults, trCrawlResults;
  try {
    edCrawlResults = requireFromWorkingDirectory(edCrawlResultsPath);
  } catch(e) {
    throw "Impossible to read " + edCrawlResultsPath + ": " + e;
  }
  try {
    trCrawlResults = requireFromWorkingDirectory(trCrawlResultsPath);
  } catch(e) {
    throw "Impossible to read " + trCrawlResultsPath + ": " + e;
  }

  edCrawlResults = await expandCrawlResult(edCrawlResults, edCrawlResultsPath.replace(/index\.json$/, ''));
  trCrawlResults = await expandCrawlResult(trCrawlResults, trCrawlResultsPath.replace(/index\.json$/, ''));

  return {
    ed: edCrawlResults.results,
    tr: trCrawlResults.results
  };
}

function reportToConsole(results) {
  let report = "";
  Object.keys(results)
    .sort((r1, r2) => results[r1].title.localeCompare(results[r2].title))
    .forEach(s => {
      const result = results[s];
      report += `<details><summary><a href="${s}">${result.title}</a></summary>\n\n`;
      if (result.brokenLinks.length) {
        report += "Links to anchors that don't exist:\n"
        result.brokenLinks.forEach(l => {
          report += "* " + l + "\n";
        })
        report += "\n\n";
      }
      if (result.evolvingLinks.length) {
        report += "Links to anchors that no longer exist in the editor draft of the target spec:\n"
        result.evolvingLinks.forEach(l => {
          report += "* " + l + "\n";
        })
        report += "\n\n";
      }
      if (result.notDfn.length) {
        report += "Links to anchors that are not definitions or headings:\n"
        result.notDfn.forEach(l => {
          report += "* " + l + "\n";
        })
        report += "\n\n";
      }
      if (result.notExported.length) {
        report += "Links to definitions that are not exported:\n"
        result.notExported.forEach(l => {
          report += "* " + l + "\n";
        })
        report += "\n\n";
      }
      if (result.datedUrls.length) {
        report += "Links to dated TR URLs:\n"
        result.datedUrls.forEach(l => {
          report += "* " + l + "\n";
        })
        report += "\n\n";
      }
      if (result.outdatedSpecs.length) {
        report += "Links to specs that should no longer be referenced:\n"
        result.outdatedSpecs.forEach(l => {
          report += "* " + l + "\n";
        })
        report += "\n\n";
      }
      if (result.unknownSpecs.length) {
        report += "Links to things that look like specs but that aren't recognized in reffy data:\n"
        result.unknownSpecs.forEach(l => {
          report += "* " + l + "\n";
        })
        report += "\n\n";
      }
      report += "</details>\n";
    });
  console.log(report);
}


/**************************************************
Export methods for use as module
**************************************************/
module.exports.studyBackrefs = studyBackrefs;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
  let edCrawlResultsPath = process.argv[2];
  let trCrawlResultsPath = process.argv[3];

  if (!edCrawlResultsPath) {
    console.error('Backrefs analyzer must be called with a paths to crawl results as first parameter');
    process.exit(2);
  }

  // If only one argument is provided, consider that it is the path to the
  // root folder of a crawl results, with "ed" and "tr" subfolders
  if (!trCrawlResultsPath) {
    trCrawlResultsPath = path.join(edCrawlResultsPath, 'tr');
    edCrawlResultsPath = path.join(edCrawlResultsPath, 'ed');
  }

  // Target the index file if needed
  if (!edCrawlResultsPath.endsWith('index.json')) {
    edCrawlResultsPath = path.join(edCrawlResultsPath, 'index.json');
  }
  if (!trCrawlResultsPath.endsWith('index.json')) {
    trCrawlResultsPath = path.join(trCrawlResultsPath, 'index.json');
  }

  // Analyze the crawl results
  loadCrawlResults(edCrawlResultsPath, trCrawlResultsPath)
    .then(crawl => studyBackrefs(crawl.ed, crawl.tr))
    .then(reportToConsole)
    .catch(e => {
      console.error(e);
      process.exit(3);
    });
}
