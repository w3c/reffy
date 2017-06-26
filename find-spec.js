const report = require("./results.json");
const blacklist = require("./blacklist.json");
const {JSDOM} = require("jsdom");

const currentSpecs = report.map(s => s.versions)
      // flatten
      .reduce((a,b) => a.concat(b), []);

// List to which we compare
// known specs, and ones we want to ignore
const matchingSpecs = currentSpecs.concat(blacklist);

const canonicalize = url => url.split('#')[0].replace('http:', 'https:');

const extractLinks = (url, selector) => new Promise((resolve, reject) => {
    return JSDOM.fromURL(url).then(dom => {
        const links = [...dom.window.document.querySelectorAll(selector)]
              .map(a => canonicalize(a.href));
        resolve(links.filter((u,i) =>
                             // not in our list
                             matchingSpecs.indexOf(u) === -1
                             // and first link to there
                             && links.indexOf(u) === i));
    });
});


Promise.all(
    [extractLinks("https://platform.html5.org/", "#contentCols dd a:first-child"),
     extractLinks("https://www.w3.org/standards/techs/js", "td h4 a:not([href*=NOTE])")])
    .then(diffs => console.log(JSON.stringify(
        diffs.reduce((a,b) => a.concat(b)).filter((u,i, a) => a.indexOf(u) === i)
        , null, 2)));

