const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');

const baseDfn = {
    id: 'foo',
    href: 'about:blank#foo',
    linkingText: [ 'Foo' ],
    localLinkingText: [],
    type: 'dfn',
    for: [],
    access: 'private',
    informative: false
};
const tests = [
  {title: "parses a simple <dfn>",
   html: "<dfn id='foo'>Foo</dfn>",
   changesToBaseDfn: [{}]
  },
  {title: "normalizes whitespace and trims text in a simple <dfn>",
   html: "<dfn id='foo'>Foo\n    \n</dfn>",
   changesToBaseDfn: [{}]
  },

  {title: "ignores a <dfn> without an id",
   html: "<dfn>Foo</dfn>",
   changesToBaseDfn: []
  },
  {title: "marks as public a <dfn data-export>",
   html: "<dfn id=foo data-export>Foo</dfn>",
   changesToBaseDfn: [{access: 'public'}]
  },
  {title: "marks as public a <dfn data-dfn-type='interface'>",
   html: "<dfn id=foo data-dfn-type=interface>Foo</dfn>",
   changesToBaseDfn: [{access: 'public', type: 'interface'}]
  },
  {title: "marks as private a <dfn data-noexport data-dfn-type='interface'>",
   html: "<dfn id=foo data-noexport data-dfn-type=interface>Foo</dfn>",
   changesToBaseDfn: [{type: 'interface'}]
  },
  {title: "detects informative definitions",
   html: "<div class=informative><dfn id=foo>Foo</dfn></div>",
   changesToBaseDfn: [{informative: true}]
  },
  {title: "associates a definition to a namespace",
   html: "<dfn data-dfn-for='Bar,Baz' id=foo>Foo</dfn>",
   changesToBaseDfn: [{for:['Bar', 'Baz']}]
  },
  {title: "considers definitions in headings",
   html: "<h2 data-dfn-type=dfn id=foo>Foo</h2>",
   changesToBaseDfn: [{}]
  },
  {title: "ignores elements that aren't <dfn> and headings",
   html: "<span data-dfn-type=dfn id=foo>Foo</span>",
   changesToBaseDfn: []
  },
  {title: "ignores headings without a data-dfn-type",
   html: "<h2 id=foo>Foo</h2>",
   changesToBaseDfn: []
  },
  {title: "includes data-lt in its list of linking text",
   html: "<dfn data-lt='foo \n   |\nbar' id=foo>Foo</dfn>",
   changesToBaseDfn: [{linkingText: ["foo", "bar"]}]
  },
];

async function assertExtractedDefinition(browser, html, dfns) {
  const page = await browser.newPage();
  page.setContent(html);
  await page.addScriptTag({
    path: path.resolve(__dirname, '../builds/browser.js')
  });

  const extractedDfns = await page.evaluate(async () => {
    return reffy.extractDefinitions();
  });
    await page.close();

  assert.deepEqual(dfns.map(d => Object.assign({}, baseDfn, d)), extractedDfns);
}


describe("Test definition extraction", () => {
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ headless: true });
  });

  tests.forEach(t => {
    it(t.title, async () => assertExtractedDefinition(browser, t.html, t.changesToBaseDfn));
  });


  after(async () => {
    await browser.close();
  });
});
