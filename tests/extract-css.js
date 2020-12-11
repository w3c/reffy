const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');

const tests = [
  {title: "parses a regular propdef table",
   html: `<table class="propdef">
    <tbody>
     <tr>
      <th>Name: 
      </th><td><dfn class="dfn-paneled css" data-dfn-type="property" data-export="" id="propdef-background-color">background-color</dfn>
     </td></tr><tr>
      <th><a href="#values">Value</a>: 
      </th><td><a class="production css" data-link-type="type" href="https://www.w3.org/TR/css-color-3/#valuea-def-color" id="ref-for-valuea-def-color" title="Expands to: aliceblue | antiquewhite | aqua | aquamarine | azure | beige | bisque | black | blanchedalmond | blue | blueviolet | brown | burlywood | cadetblue | chartreuse | chocolate | coral | cornflowerblue | cornsilk | crimson | currentcolor | cyan | darkblue | darkcyan | darkgoldenrod | darkgray | darkgreen | darkgrey | darkkhaki | darkmagenta | darkolivegreen | darkorange | darkorchid | darkred | darksalmon | darkseagreen | darkslateblue | darkslategray | darkslategrey | darkturquoise | darkviolet | deeppink | deepskyblue | dimgray | dimgrey | dodgerblue | firebrick | floralwhite | forestgreen | fuchsia | gainsboro | ghostwhite | gold | goldenrod | gray | green | greenyellow | grey | honeydew | hotpink | indianred | indigo | ivory | khaki | lavender | lavenderblush | lawngreen | lemonchiffon | lightblue | lightcoral | lightcyan | lightgoldenrodyellow | lightgray | lightgreen | lightgrey | lightpink | lightsalmon | lightseagreen | lightskyblue | lightslategray | lightslategrey | lightsteelblue | lightyellow | lime | limegreen | linen | magenta | maroon | mediumaquamarine | mediumblue | mediumorchid | mediumpurple | mediumseagreen | mediumslateblue | mediumspringgreen | mediumturquoise | mediumvioletred | midnightblue | mintcream | mistyrose | moccasin | navajowhite | navy | oldlace | olive | olivedrab | orange | orangered | orchid | palegoldenrod | palegreen | paleturquoise | palevioletred | papayawhip | peachpuff | peru | pink | plum | powderblue | purple | rebeccapurple | red | rosybrown | royalblue | saddlebrown | salmon | sandybrown | seagreen | seashell | sienna | silver | skyblue | slateblue | slategray | slategrey | snow | springgreen | steelblue | tan | teal | thistle | tomato | transparent | turquoise | violet | wheat | white | whitesmoke | yellow | yellowgreen">&lt;color&gt;</a> 
     </td></tr><tr>
      <th>Initial: 
      </th><td>transparent 
     </td></tr><tr>
      <th>Applies to: 
      </th><td>all elements 
     </td></tr><tr>
      <th>Inherited: 
      </th><td>no 
     </td></tr><tr>
      <th>Percentages: 
      </th><td>N/A 
     </td></tr><tr>
      <th>Computed value: 
      </th><td>computed color 
     </td></tr><tr>
      <th>Animation type: 
      </th><td>by computed value 
   </td></tr></tbody></table>`,
   css: {
    "background-color": {
      "name": "background-color",
      "value": "<color>",
      "initial": "transparent",
      "appliesTo": "all elements",
      "inherited": "no",
      "percentages": "N/A",
      "computedValue": "computed color",
      "animationType": "by computed value"
    }
   }
  },
  {title: "parses a propdef table with embedded MDN annotations",
   html: `<table class="def propdef" data-link-for-hint="align-content">
    <tbody>
     <tr>
      <th>Name:
      </th><td>
       <aside class="mdn-anno wrapped">
        <button class="mdn-anno-btn"><b class="all-engines-flag" title="This feature is in all current engines.">✔</b><span>MDN</span></button>
        <div class="feature">
         <p><a href="https://developer.mozilla.org/en-US/docs/Web/CSS/align-content" title="The CSS align-content property sets the distribution of space between and around content items along a flexbox's cross-axis or a grid's block axis.">align-content</a></p>
         <p class="all-engines-text">In all current engines.</p>
         <div class="support">
          <span class="firefox yes"><span>Firefox</span><span>28+</span></span><span class="safari yes"><span>Safari</span><span>9+</span></span><span class="chrome yes"><span>Chrome</span><span>29+</span></span>
          <hr>
          <span class="opera yes"><span>Opera</span><span>12.1+</span></span><span class="edge_blink yes"><span>Edge</span><span>79+</span></span>
          <hr>
          <span class="edge yes"><span>Edge (Legacy)</span><span>12+</span></span><span class="ie yes"><span>IE</span><span>11</span></span>
          <hr>
          <span class="firefox_android yes"><span>Firefox for Android</span><span>28+</span></span><span class="safari_ios yes"><span>iOS Safari</span><span>9+</span></span><span class="chrome_android yes"><span>Chrome for Android</span><span>29+</span></span><span class="webview_android yes"><span>Android WebView</span><span>4.4+</span></span><span class="samsunginternet_android yes"><span>Samsung Internet</span><span>2.0+</span></span><span class="opera_android yes"><span>Opera Mobile</span><span>12.1+</span></span>
         </div>
        </div>
        <div class="feature">
         <p><a href="https://developer.mozilla.org/en-US/docs/Web/CSS/align-content" title="The CSS align-content property sets the distribution of space between and around content items along a flexbox's cross-axis or a grid's block axis.">align-content</a></p>
         <p class="all-engines-text">In all current engines.</p>
         <div class="support">
          <span class="firefox yes"><span>Firefox</span><span>52+</span></span><span class="safari yes"><span>Safari</span><span>10.1+</span></span><span class="chrome yes"><span>Chrome</span><span>57+</span></span>
          <hr>
          <span class="opera yes"><span>Opera</span><span>44+</span></span><span class="edge_blink yes"><span>Edge</span><span>79+</span></span>
          <hr>
          <span class="edge yes"><span>Edge (Legacy)</span><span>16+</span></span><span class="ie no"><span>IE</span><span>None</span></span>
          <hr>
          <span class="firefox_android yes"><span>Firefox for Android</span><span>52+</span></span><span class="safari_ios yes"><span>iOS Safari</span><span>10.3+</span></span><span class="chrome_android yes"><span>Chrome for Android</span><span>52+</span></span><span class="webview_android yes"><span>Android WebView</span><span>57+</span></span><span class="samsunginternet_android yes"><span>Samsung Internet</span><span>6.2+</span></span><span class="opera_android yes"><span>Opera Mobile</span><span>43+</span></span>
         </div>
        </div>
       </aside>
       <dfn class="dfn-paneled css" data-dfn-type="property" data-export="" id="propdef-align-content">align-content</dfn>
     </td></tr><tr class="value">
      <th><a href="https://www.w3.org/TR/css-values/#value-defs">Value:</a>
      </th><td class="prod">normal <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one①⑤">|</a> <a class="production css" data-link-type="type" href="#typedef-baseline-position" id="ref-for-typedef-baseline-position①" title="Expands to: baseline | first | last">&lt;baseline-position&gt;</a> <span id="ref-for-comb-one①⑥">|</span> <a class="production css" data-link-type="type" href="#typedef-content-distribution" id="ref-for-typedef-content-distribution①" title="Expands to: space-around | space-between | space-evenly | stretch">&lt;content-distribution&gt;</a> <span id="ref-for-comb-one①⑦">|</span> <a class="production css" data-link-type="type" href="#typedef-overflow-position" id="ref-for-typedef-overflow-position②" title="Expands to: safe | unsafe">&lt;overflow-position&gt;</a><a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#mult-opt" id="ref-for-mult-opt①">?</a> <a class="production css" data-link-type="type" href="#typedef-content-position" id="ref-for-typedef-content-position②" title="Expands to: center | end | flex-end | flex-start | start">&lt;content-position&gt;</a> 
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-cascade/#initial-values">Initial:</a>
      </th><td>normal 
     </td></tr><tr>
      <th>Applies to:
      </th><td>block containers, multicol containers, flex containers, and grid containers 
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-cascade/#inherited-property">Inherited:</a>
      </th><td>no 
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-values/#percentages">Percentages:</a>
      </th><td>n/a 
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-cascade/#computed">Computed value:</a>
      </th><td>specified keyword(s) 
     </td></tr><tr>
      <th>Canonical order:
      </th><td>per grammar 
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/web-animations/#animation-type">Animation type:</a>
      </th><td>discrete 
   </td></tr></tbody></table>`,
   css: {
     "align-content": {
       "name": "align-content",
       "value": "normal | <baseline-position> | <content-distribution> | <overflow-position>? <content-position>",
       "initial": "normal",
       "appliesTo": "block containers, multicol containers, flex containers, and grid containers",
       "inherited": "no",
       "percentages": "n/a",
       "computedValue": "specified keyword(s)",
       "canonicalOrder": "per grammar",
       "animationType": "discrete"
     }
   }
  }
]

describe("Test CSS properties extraction", function() {
  this.slow(5000);
  this.timeout(10000);
  let browser;
  let extractCSSCode;
  before(async () => {
    // Convert the JS module to a JS script that can be loaded in Puppeteer
    // without having to provide a URL for it (tests run in "about:blank" pages)
    const bundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-cssdfn.mjs')
    });
    const { output } = await bundle.generate({
      name: 'extractCSS',
      format: 'iife'
    });
    extractCSSCode = output[0].code;
    browser = await puppeteer.launch({ headless: true });
  });

  tests.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      let pageContent = t.html;
      page.setContent(pageContent);
      await page.addScriptTag({ content: extractCSSCode });

      const extractedCss = await page.evaluate(async () => {
        return extractCSS();
      });
      await page.close();

      assert.deepEqual(extractedCss.properties, t.css);
    });
  });


  after(async () => {
    await browser.close();
  });
});

