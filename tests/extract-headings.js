const { assert } = require('chai');
const puppeteer = require('puppeteer');
const { buildBrowserlib } = require("../src/lib/util");

const testHeadings = [
  {
    title: "extracts a simple heading",
    html: "<h1 id=title>Title</h1>",
    res: [{id: "title", title: "Title", level: 1}]
  },
  {
    title: "ignores a heading without id",
    html: "<h1>Heading without id</h1>",
    res: []
  },
  {
    title: "extracts a heading title without its section number",
    html: "<h2 id=title>2.3 Title</h2>",
    res: [{id: "title", title: "Title", number: "2.3", level: 2}]
  }
];

describe("Test headings extraction", function () {
  this.slow(5000);

  let browser;
  let browserlib;
  before(async () => {
    browser = await puppeteer.launch({ headless: true });
    browserlib = await buildBrowserlib();
  });

  testHeadings.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html);
      await page.addScriptTag({ content: browserlib });

      const extractedHeadings = await page.evaluate(async () => {
        const idToHeading = reffy.mapIdsToHeadings();
        return reffy.extractHeadings(idToHeading);
      });
      await page.close();
      assert.deepEqual(extractedHeadings, t.res);
    });
  });


  after(async () => {
    await browser.close();
  });
});
