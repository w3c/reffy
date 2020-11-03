const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');

// Note: Most of these tests are taken from the Sample outlines section in HTML
// https://html.spec.whatwg.org/multipage/sections.html#sample-outlines
const testOutlines = [
  {
    title: "handles implied sections",
    html: `
<body>
 <nav>
  <p><a href="/">Home</a></p>
 </nav>
 <p>Hello world.</p>
 <aside>
  <p id="charlie">My cat is cute.</p>
 </aside>
</body>`,

    res: `
0 - (implied)
1 - (implied)
1 - (implied)
`,

    whereischarlie: "(implied)"
  },


  {
    title: "handles sibling heading content elements",
    html: `
  }
<h1>The Tax Book</h1>
<h2>Earning money</h2>
<p>Earning money is good.</p>
<h3>Getting a job</h3>
<p>To earn money you typically need a job.</p>
<h2>Spending money</h2>
<p>Spending is what money is mainly used for.</p>
<h3>Cheap things</h3>
<p>Buying cheap things often not cost-effective.</p>
<h3>Expensive things</h3>
<p>The most expensive thing is often not the most cost-effective either.</p>
<h2>Investing money</h2>
<p id="charlie">You can lend your money to other people.</p>
<h2>Losing money</h2>
<p>If you spend money or invest money, sooner or later you will lose money.
<h3>Poor judgement</h3>
<p>Usually if you lose money it's because you made a mistake.</p>`,

    res: `
0 - The Tax Book
1 - Earning money
2 - Getting a job
1 - Spending money
2 - Cheap things
2 - Expensive things
1 - Investing money
1 - Losing money
2 - Poor judgement`,

    whereischarlie: "Investing money"
  },


  {
    title: "handles sectioning content elements",
    html: `
<h1>The Tax Book</h1>
<section>
 <h1>Earning money</h1>
 <p>Earning money is good.</p>
 <section>
  <h1>Getting a job</h1>
  <p>To earn money you typically need a job.</p>
 </section>
</section>
<section>
 <h1>Spending money</h1>
 <p>Spending is what money is mainly used for.</p>
 <section>
  <h1>Cheap things</h1>
  <p>Buying cheap things often not cost-effective.</p>
 </section>
 <section>
  <h1>Expensive things</h1>
  <p>The most expensive thing is often not the most cost-effective either.</p>
 </section>
</section>
<section>
 <h1>Investing money</h1>
 <p id="charlie">You can lend your money to other people.</p>
</section>
<section>
 <h1>Losing money</h1>
 <p>If you spend money or invest money, sooner or later you will lose money.
 <section>
  <h1>Poor judgement</h1>
  <p>Usually if you lose money it's because you made a mistake.</p>
 </section>
</section>`,

    res: `
0 - The Tax Book
1 - Earning money
2 - Getting a job
1 - Spending money
2 - Cheap things
2 - Expensive things
1 - Investing money
1 - Losing money
2 - Poor judgement`,

    whereischarlie: "Investing money"
  },


  {
    title: "handles multiple top-level headings",
    html: `
<h1>Apples</h1>
<p>Pomaceous.</p>
<h1>Bananas</h1>
<p id="charlie">Edible.</p>
<h1>Carambola</h1>
<p>Star.</p>`,

    res: `
0 - Apples
0 - Bananas
0 - Carambola`,

    whereischarlie: "Bananas"
  },


  {
    title: "handles sectioning content mixed with h1-h6",
    html: `
<section>
 <h1>Apples</h1>
 <p>Pomaceous.</p>
 <h1>Bananas</h1>
 <p id="charlie">Edible.</p>
 <h1>Carambola</h1>
 <p>Star.</p>
</section>`,

    res: `
0 - (implied)
1 - Apples
1 - Bananas
1 - Carambola`,

    whereischarlie: "Bananas"
  },


  {
    title: "never rises headings above other sections",

    html: `
<section>
 <h1>A plea from our caretakers</h1>
 <p>Please, we beg of you, send help! We're stuck in the server room!</p>
</section>
<h1>Feathers</h1>
<p id="charlie">Epidermal growths.</p>`,

    res: `
0 - (implied)
1 - A plea from our caretakers
0 - Feathers`,

    whereischarlie: "Feathers"
  },


  {
    title: "handles late headings",
    html: `
<h1>Ray's blog</h1>
<article>
 <header>
  <nav>
   <a href="?t=-1d">Yesterday</a>;
   <a href="?t=-7d" id="charlie">Last week</a>;
   <a href="?t=-1m">Last month</a>
  </nav>
  <h1>We're adopting a child!</h1>
 </header>
 <p>As of today, Janine and I have signed the papers to become
 the proud parents of baby Diane! We've been looking forward to
 this day for weeks.</p>
</article>`,

    res: `
0 - Ray's blog
1 - (implied)
2 - (implied)
1 - We're adopting a child!`,

    whereischarlie: "(implied)"
  },


  {
    title: "handles hgroup elements",
    html: `
<hgroup>
 <h1> The morning </h1>
 <h2> 06:00 to 12:00 </h2>
</hgroup>
<p>We sleep.</p>
<hgroup>
 <h1> The afternoon </h1>
 <h2> 12:00 to 18:00 </h2>
</hgroup>
<p id="charlie">We study.</p>
<hgroup>
 <h2>Additional Commentary</h2>
 <h3>Because not all this is necessarily true</h3>
 <h6>Ok it's almost certainly not true</h6>
</hgroup>
<p>Yeah we probably play, rather than study.</p>
<hgroup>
 <h1> The evening </h1>
 <h2> 18:00 to 00:00 </h2>
</hgroup>
<p>We play.</p>
<hgroup>
 <h1> The night </h1>
 <h2> 00:00 to 06:00 </h2>
</hgroup>
<p>We play some more.</p>`,

    res: `
0 - The morning
06:00 to 12:00
0 - The afternoon
12:00 to 18:00
1 - Additional Commentary
Because not all this is necessarily true
Ok it's almost certainly not true
0 - The evening
18:00 to 00:00
0 - The night
00:00 to 06:00`,

    whereischarlie: `The afternoon
12:00 to 18:00`
  },


  {
    title: "ignores children that create their own outline",
    html: `
<h1>Main outline</h1>
<h2>A table</h2>
<table>
  <tbody>
   <tr>
    <th>Heading</th>
    <td>
      <h1>Another outline</h1>
      <p id="charlie">Content in other outline</p>
    </td>
   </tr>
  </tbody>
 </table>
<h2>A chair</h2>
<p>No chair element in HTML, why?</p>`,

    res: `
0 - Main outline
1 - A table
1 - A chair`,

    whereischarlie: "Another outline"
  }
];


describe("Test outline generation", function () {
  this.slow(5000);

  let browser;
  before(async () => {
    browser = await puppeteer.launch({ headless: true });
  });

  testOutlines.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html);
      await page.addScriptTag({
        path: path.resolve(__dirname, "../builds/browser.js")
      });

      const result = await page.evaluate(async () => {
        function outlineToString(outline, level) {
          level = level || 0;
          return outline.map(section =>
            level + ' - ' + (section.heading.innerText || "(implied)") + '\n' +
            outlineToString(section.subSections, level + 1)).join("");
        }
        const { outline, nodeToSection } = reffy.createOutline(document.body);

        const charlie = document.getElementById("charlie");
        const section = nodeToSection.get(charlie);
        const heading = section ? (section.heading.innerText || "(implied)") : null;
        return {
          outline: outlineToString(outline),
          heading
        };
      });
      await page.close();
      assert.deepEqual(result.outline.trim(), t.res.trim());
      assert.deepEqual(result.heading, t.whereischarlie);
    });
  });


  after(async () => {
    await browser.close();
  });
});
