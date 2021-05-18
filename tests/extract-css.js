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
  },

  {
    title: "parses a valuespace prose definition, excluding tests and notes",
    html: `<dl>
    <dt><dfn class="css" data-dfn-for="text-indent" data-dfn-type="value" data-export="" id="valdef-text-indent-percentage">&lt;percentage&gt;<a class="self-link" href="#valdef-text-indent-percentage"></a></dfn> 
    </dt><dd>
      Gives the amount of the indent
      as a percentage of the block container’s own <a data-link-type="dfn" href="https://drafts.csswg.org/css-writing-modes-4/#logical-width" id="ref-for-logical-width">logical width</a>. 
     <details class="wpt-tests-block" dir="ltr" lang="en">
      <summary>Tests</summary>
      <ul class="wpt-tests-list">
       <li class="wpt-test"><a class="wpt-name" href="https://wpt.fyi/results/css/CSS2/text/text-indent-011.xht">text-indent-011.xht</a> <a class="wpt-live" href="http://wpt.live/css/CSS2/text/text-indent-011.xht" title="css/CSS2/text/text-indent-011.xht"><small>(live test)</small></a> <a class="wpt-source" href="https://github.com/web-platform-tests/wpt/blob/master/css/CSS2/text/text-indent-011.xht"><small>(source)</small></a></li>
      </ul>
     </details>
     <p>Percentages must be treated as <span class="css">0</span> for the purpose of calculating <a data-link-type="dfn" href="https://drafts.csswg.org/css-sizing-3/#intrinsic-size-contribution" id="ref-for-intrinsic-size-contribution">intrinsic size contributions</a>,
      but are always resolved normally when performing layout.</p>
     <details class="wpt-tests-block" dir="ltr" lang="en">
      <summary>Tests</summary>
      <ul class="wpt-tests-list">
       <li class="wpt-test"><a class="wpt-name" href="https://wpt.fyi/results/css/css-text/text-indent/percentage-value-intrinsic-size.html">percentage-value-intrinsic-size.html</a> <a class="wpt-live" href="http://wpt.live/css/css-text/text-indent/percentage-value-intrinsic-size.html" title="css/css-text/text-indent/percentage-value-intrinsic-size.html"><small>(live test)</small></a> <a class="wpt-source" href="https://github.com/web-platform-tests/wpt/blob/master/css/css-text/text-indent/percentage-value-intrinsic-size.html"><small>(source)</small></a></li>
      </ul>
     </details>
     <p class="note" role="note"><span>Note:</span> This can lead to the element overflowing.
      It is not recommended to use percentage indents and intrinsic sizing together.</p>
    </dd></dl>`,
    propertyName: "valuespaces",
    css: {
      "<percentage>": {
        "prose": "Gives the amount of the indent as a percentage of the block container’s own logical width. Percentages must be treated as 0 for the purpose of calculating intrinsic size contributions, but are always resolved normally when performing layout."
      }
    }
  },

  {
    title: "parses a valuespace prose definition, excluding subsections",
    html: `<dl>
     <dt data-md=""><dfn class="css" data-dfn-for="ray()" data-dfn-type="value" data-export="" id="valdef-ray-size">&lt;size&gt;<a class="self-link" href="#valdef-ray-size"></a></dfn>
      </dt><dd data-md="">
       <p>Decides the path length used when <a class="property" data-link-type="propdesc" href="#propdef-offset-distance" id="ref-for-propdef-offset-distance②">offset-distance</a> is expressed as a percentage, using the distance to the containing box. For <a class="production css" data-link-type="type" href="https://drafts.csswg.org/css-images-3/#typedef-size" id="ref-for-typedef-size①" title="Expands to: <length-percentage>{2} | <length> | closest-corner | closest-side | farthest-corner | farthest-side | sides">&lt;size&gt;</a> values other than <a href="#size-sides" id="ref-for-size-sides">sides</a>, the path length is independent of <a class="production css" data-link-type="type" href="https://drafts.csswg.org/css-values-3/#angle-value" id="ref-for-angle-value④" title="Expands to: deg | grad | rad | turn">&lt;angle&gt;</a>.</p>
       <p>It is defined as:</p>
       <p>&nbsp;<b>&lt;size&gt;</b> = [ closest-side | closest-corner | farthest-side | farthest-corner | sides ]</p>
       <dl>
        <dt data-md=""><dfn class="dfn-paneled css" data-dfn-for="<size>" data-dfn-type="value" data-export="" id="size-closest-side">closest-side</dfn>
        </dt><dd data-md="">
         <p>The perpendicular distance is measured between the initial position and the closest side of the box from it.</p>
        </dd><dt data-md=""><dfn class="css" data-dfn-for="<size>" data-dfn-type="value" data-export="" id="size-closest-corner">closest-corner<a class="self-link" href="#size-closest-corner"></a></dfn>
        </dt><dd data-md="">
         <p>The distance is measured between the initial position and the closest corner of the box from it.</p>
        </dd><dt data-md=""><dfn class="dfn-paneled css" data-dfn-for="<size>" data-dfn-type="value" data-export="" id="size-farthest-side">farthest-side</dfn>
        </dt><dd data-md="">
         <p>The perpendicular distance is measured between the initial position and the farthest side of the box from it.</p>
        </dd><dt data-md=""><dfn class="css" data-dfn-for="<size>" data-dfn-type="value" data-export="" id="size-farthest-corner">farthest-corner<a class="self-link" href="#size-farthest-corner"></a></dfn>
        </dt><dd data-md="">
         <p>The distance is measured between the initial position and the farthest corner of the box from it.</p>
        </dd><dt data-md=""><dfn class="dfn-paneled css" data-dfn-for="<size>" data-dfn-type="value" data-export="" id="size-sides">sides</dfn>
        </dt><dd data-md="">
         <p>The distance is measured between the initial position and the intersection of the ray with the box. If the initial position is not within the box, the distance is 0.</p>
       </dd></dl>
      </dd></dl>`,
    propertyName: "valuespaces",
    css: {
      "<size>": {
        "prose": "Decides the path length used when offset-distance is expressed as a percentage, using the distance to the containing box. For <size> values other than sides, the path length is independent of <angle>. It is defined as: <size> = [ closest-side | closest-corner | farthest-side | farthest-corner | sides ]"
      }
    }
  }
];

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

      assert.deepEqual(extractedCss[t.propertyName ?? 'properties'], t.css);
    });
  });


  after(async () => {
    await browser.close();
  });
});

