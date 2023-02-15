const assert = require('assert');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');
const { getSchemaValidationFunction } = require('../src/lib/util');

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
   css: [{
      "name": "background-color",
      "value": "<color>",
      "initial": "transparent",
      "appliesTo": "all elements",
      "inherited": "no",
      "percentages": "N/A",
      "computedValue": "computed color",
      "animationType": "by computed value"
   }]
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
   css: [{
       "name": "align-content",
       "value": "normal | <baseline-position> | <content-distribution> | <overflow-position>? <content-position>",
       "initial": "normal",
       "appliesTo": "block containers, multicol containers, flex containers, and grid containers",
       "inherited": "no",
       "percentages": "n/a",
       "computedValue": "specified keyword(s)",
       "canonicalOrder": "per grammar",
       "animationType": "discrete"
   }]
  },

  {
    title: "ignores properties defined in an informative section",
    html: `<div class="non-normative">
      <table class="propdef">
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
     </td></tr></tbody></table></div>`,
    css: []
  },

  {
    title: "parses a type value definition",
    html: `<dl>
    <dt><dfn class="css" data-dfn-type="type" data-export="" id="valdef-text-indent-percentage">&lt;percentage&gt;<a class="self-link" href="#valdef-text-indent-percentage"></a></dfn> 
    </dt><dd>
      Gives the amount of the indent
      as a percentage of the block container’s own <a data-link-type="dfn" href="https://drafts.csswg.org/css-writing-modes-4/#logical-width" id="ref-for-logical-width">logical width</a>. 
     <p>Percentages must be treated as <span class="css">0</span> for the purpose of calculating <a data-link-type="dfn" href="https://drafts.csswg.org/css-sizing-3/#intrinsic-size-contribution" id="ref-for-intrinsic-size-contribution">intrinsic size contributions</a>,
      but are always resolved normally when performing layout.</p>
    </dd></dl>`,
    propertyName: "values",
    css: [{
        "name": "<percentage>",
        "type": "type",
        "prose": "Gives the amount of the indent as a percentage of the block container’s own logical width. Percentages must be treated as 0 for the purpose of calculating intrinsic size contributions, but are always resolved normally when performing layout."
    }]
  },

  {
    title: "ignores a value definition in an informative section",
    html: `<div class="note"><dl>
    <dt><dfn class="css" data-dfn-type="value" data-export="" id="valdef-text-indent-percentage">&lt;percentage&gt;<a class="self-link" href="#valdef-text-indent-percentage"></a></dfn> 
    </dt><dd>
      Gives the amount of the indent
      as a percentage of the block container’s own <a data-link-type="dfn" href="https://drafts.csswg.org/css-writing-modes-4/#logical-width" id="ref-for-logical-width">logical width</a>. 
     <p>Percentages must be treated as <span class="css">0</span> for the purpose of calculating <a data-link-type="dfn" href="https://drafts.csswg.org/css-sizing-3/#intrinsic-size-contribution" id="ref-for-intrinsic-size-contribution">intrinsic size contributions</a>,
      but are always resolved normally when performing layout.</p>
    </dd></dl></div>`,
    propertyName: "values",
    css: []
  },

  {
    title: "parses a type definition, excluding tests and notes",
    html: `<dl>
    <dt><dfn class="css" data-dfn-type="type" data-export="" id="valdef-text-indent-percentage">&lt;percentage&gt;<a class="self-link" href="#valdef-text-indent-percentage"></a></dfn> 
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
    propertyName: "values",
    css: [{
        "name": "<percentage>",
        "type": "type",
        "prose": "Gives the amount of the indent as a percentage of the block container’s own logical width. Percentages must be treated as 0 for the purpose of calculating intrinsic size contributions, but are always resolved normally when performing layout."
    }]
  },

  {
    title: "parses a type definition, excluding subsections",
    html: `<dl>
     <dt data-md=""><dfn class="css" data-dfn-type="type" data-export="" id="valdef-ray-size">&lt;size&gt;<a class="self-link" href="#valdef-ray-size"></a></dfn>
      </dt><dd data-md="">
       <p>Decides the path length used when <a class="property" data-link-type="propdesc" href="#propdef-offset-distance" id="ref-for-propdef-offset-distance②">offset-distance</a> is expressed as a percentage, using the distance to the containing box. For <a class="production css" data-link-type="type" href="https://drafts.csswg.org/css-images-3/#typedef-size" id="ref-for-typedef-size①" title="Expands to: <length-percentage>{2} | <length> | closest-corner | closest-side | farthest-corner | farthest-side | sides">&lt;size&gt;</a> values other than <a href="#size-sides" id="ref-for-size-sides">sides</a>, the path length is independent of <a class="production css" data-link-type="type" href="https://drafts.csswg.org/css-values-3/#angle-value" id="ref-for-angle-value④" title="Expands to: deg | grad | rad | turn">&lt;angle&gt;</a>.</p>
       <p>It is defined as:</p>
       <pre class="prod">&nbsp;<b>&lt;size&gt;</b> = [ closest-side | closest-corner | farthest-side | farthest-corner | sides ]</pre>
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
    propertyName: "values",
    css: [{
        "name": "<size>",
        "type": "type",
        "value": "[ closest-side | closest-corner | farthest-side | farthest-corner | sides ]",
      "type": "type",
      "values": [
        {
          "name": "closest-side",
          "prose": "The perpendicular distance is measured between the initial position and the closest side of the box from it.",
          "value": "closest-side",
          "type": "value"
        },
        {
          "name": "closest-corner",
          "prose": "The distance is measured between the initial position and the closest corner of the box from it.",
          "value": "closest-corner",
          "type": "value"
        },
        {
          "name": "farthest-side",
          "prose": "The perpendicular distance is measured between the initial position and the farthest side of the box from it.",
          "value": "farthest-side",
          "type": "value"
        },
        {
          "name": "farthest-corner",
          "prose": "The distance is measured between the initial position and the farthest corner of the box from it.",
          "value": "farthest-corner",
          "type": "value"
        },
        {
          "name": "sides",
          "prose": "The distance is measured between the initial position and the intersection of the ray with the box. If the initial position is not within the box, the distance is 0.",
          "value": "sides",
          "type": "value"
        }
      ]
    }]
  },


  {
    title: "ignores a value definition when data-dfn-type is not correct",
    html: `<div class="note"><dl>
    <dt><dfn class="css" data-dfn-type="value">value</dfn></dt>
    <dd>Value</dd>
    <dt><dfn class="css" data-dfn-type="selector">selector</dfn></dt>
    <dd>Selector</dd>
    <dt><dfn class="css" data-dfn-type="at-rule">at-rule</dfn></dt>
    <dd>Selector</dd>
    </dl></div>`,
    propertyName: "values",
    css: []
  },

  {
    title: "knows that second definition of rgb() is legacy",
    html: `
      <p>The <dfn data-dfn-type="function">rgb()</dfn> function has a
      legacy value.</p>
      <pre class="prod">
        &lt;rgb()> = rgb( modern )
      </pre>
      <pre class="prod">
        &lt;rgb()> = rgb( legacy )
      </pre>
    `,
    propertyName: "values",
    css: [{
        "name": "rgb()",
        "type": "function",
        "prose": "The rgb() function has a legacy value.",
        "value": "rgb( modern )",
        "legacyValue": "rgb( legacy )"
    }]
  },

  {
    title: "extracts an at-rule syntax",
    html: `
      <dfn data-dfn-type="at-rule">@layer</dfn> is an at-rule.
      <pre class="prod">
        @layer <a class="production">&lt;layer-name&gt;</a>? {
          <a class="production">&lt;stylesheet&gt;</a>
        }
      </pre>
    `,
    propertyName: "atrules",
    css: [{
        name: "@layer",
        value: "@layer <layer-name>? { <stylesheet> }",
        descriptors: []
    }]
  },

  {
    title: "extracts an at-rule syntax with multiple definitions",
    html: `
      <dfn data-dfn-type="at-rule">@layer</dfn> is an at-rule.
      <pre class="prod">
        @layer <a class="production">&lt;layer-name&gt;</a>? {
          <a class="production">&lt;stylesheet&gt;</a>
        }
      </pre>
      <pre class="prod">
        @layer <a class="production">&lt;layer-name&gt;</a>#;
      </pre>
    `,
    propertyName: "atrules",
    css: [{
        name: "@layer",
        value: "@layer <layer-name>? { <stylesheet> } | @layer <layer-name>#;",
        descriptors: []
    }]
  },

  {
    title: "combines an at-rule syntax with descriptor",
    html: `
      <pre class="prod">
        @font-face {
          &lt;declaration-list&gt;
        }
      </pre>
      <table class="def descdef">
      <tbody>
       <tr>
        <th>Name:
        </th><td><dfn class="dfn-paneled css" data-dfn-for="@font-face" data-dfn-type="descriptor" data-export="" id="descdef-font-face-font-display">font-display</dfn>
       </td></tr><tr>
        <th>For:
        </th><td><a class="css" data-link-type="at-rule" href="#at-font-face-rule" id="ref-for-at-font-face-rule④⑥">@font-face</a>
       </td></tr><tr>
        <th>Value:
        </th><td class="prod">auto <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one⑥⑨">|</a> block <span id="ref-for-comb-one⑦⓪">|</span> swap <span id="ref-for-comb-one⑦①">|</span> fallback <span id="ref-for-comb-one⑦②">|</span> optional
       </td></tr><tr>
        <th>Initial:
        </th><td>auto
     </td></tr></tbody></table>
    `,
    propertyName: "atrules",
    css: [{
        "name": "@font-face",
        "value": "@font-face { <declaration-list> }",
        "descriptors": [
          {
            for: "@font-face",
            initial: "auto",
            name: "font-display",
            value: "auto | block | swap | fallback | optional"
          }
        ]
    }]
  },


  {
    title: "extracts multiple descriptors with the same name",
    html: `
      <table class="def descdef">
    <tbody>
     <tr>
      <th>Name:
      </th><td><dfn class="dfn-paneled css" data-dfn-for="@font-face" data-dfn-type="descriptor" data-export="" id="descdef-font-face-font-display">font-display</dfn>
     </td></tr><tr>
      <th>For:
      </th><td><a class="css" data-link-type="at-rule" href="#at-font-face-rule" id="ref-for-at-font-face-rule④⑥">@font-face</a>
     </td></tr><tr>
      <th>Value:
      </th><td class="prod">auto <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one⑥⑨">|</a> block <span id="ref-for-comb-one⑦⓪">|</span> swap <span id="ref-for-comb-one⑦①">|</span> fallback <span id="ref-for-comb-one⑦②">|</span> optional
     </td></tr><tr>
      <th>Initial:
      </th><td>auto
   </td></tr></tbody></table>
   <table class="def descdef">
    <tbody>
     <tr>
      <th>Name:
      </th><td><dfn class="dfn-paneled css" data-dfn-for="@font-feature-values" data-dfn-type="descriptor" data-export="" id="descdef-font-feature-values-font-display">font-display</dfn>
     </td></tr><tr>
      <th>For:
      </th><td><a class="css" data-link-type="at-rule" href="#at-ruledef-font-feature-values" id="ref-for-at-ruledef-font-feature-values③">@font-feature-values</a>
     </td></tr><tr>
      <th>Value:
      </th><td class="prod">auto <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one⑦③">|</a> block <span id="ref-for-comb-one⑦④">|</span> swap <span id="ref-for-comb-one⑦⑤">|</span> fallback <span id="ref-for-comb-one⑦⑥">|</span> optional
     </td></tr><tr>
      <th>Initial:
      </th><td>auto
   </td></tr></tbody></table>`,
    propertyName: "atrules",
    css: [
      {
        "name": "@font-face",
        "descriptors": [
          {
            for: "@font-face",
            initial: "auto",
            name: "font-display",
            value: "auto | block | swap | fallback | optional"
          }
        ]
      },
      {
        "name": "@font-feature-values",
        "descriptors": [
          {
            for: "@font-feature-values",
            initial: "auto",
            name: "font-display",
            value: "auto | block | swap | fallback | optional"
          }
        ]
      }
    ]
  },


  {
    title: "ignores definitions that describe changes",
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
        </th><td><del>computed color</del> Changed
       </td></tr><tr>
        <th>Animation type:
        </th><td>by computed value
     </td></tr></tbody></table>`,
    css: []
  },

  {
    title: "ignores comments",
    html: `<pre class="prod">
<dfn data-dfn-type="type">&lt;page-selector-list></dfn> = &lt;page-selector>#
/* A comment */
<dfn data-dfn-type="type">&lt;page-selector></dfn> = [ &lt;ident-token>? &lt;pseudo-page>* ]!
<dfn data-dfn-type="type">&lt;pseudo-page></dfn> = ':' [ left | right | first | blank ] /* Another comment */

/* Yet another one
that spans multiple lines */
<dfn data-dfn-type="at-rule">@top-left-corner</dfn> = @top-left-corner { &lt;declaration-list> };
</pre>`,
    propertyName: "values",
    css: [
      {
        name: "<page-selector-list>",
        type: "type",
        value: "<page-selector>#"
      },
      {
        name: "<page-selector>",
        type: "type",
        value: "[ <ident-token>? <pseudo-page>* ]!"
      },
      {
        name: "<pseudo-page>",
        type: "type",
        value: "':' [ left | right | first | blank ]"
      }
    ]
  },

  {
    title: "parses syntax value preferably",
    html: `<div>
      <p>
        <dfn data-dfn-type="function" data-lt="toto()">&lt;toto(A)></dfn> is a super function.</dfn>
      </p>
      <pre class="prod"><code>
        &lt;toto()> = toto( &lt;integer> )
      </code></pre>`,
    propertyName: "values",
    css: [{
        name: "toto()",
        type: "function",
        prose: "<toto(A)> is a super function.",
        value: "toto( <integer> )"
    }]
  },

  {
    title: "sorts out multiple production rules in prose",
    html: `<div class="prod">
        <dfn data-dfn-type="type">
          &lt;step-easing-function&gt;
        </dfn> = step-start | step-end | steps(&lt;integer&gt;[, &lt;step-position&gt;]?)
        <p><dfn data-dfn-type="type">
          &lt;step-position&gt;</dfn> = jump-start | jump-end | jump-none | jump-both | start | end
        </p>
      </div>
      <div class="prod">
        <dfn data-dfn-type="type">&lt;same-level&gt;</dfn> = &lt;other-at-same-level&gt;
        <br/>
        <dfn data-dfn-type="type">&lt;other-at-same-level&gt;</dfn> = foo`,
    propertyName: "values",
    css: [
      {
        name: "<step-easing-function>",
        type: "type",
        value: "step-start | step-end | steps(<integer>[, <step-position>]?)"
      },
      {
        name: "<step-position>",
        type: "type",
        value: "jump-start | jump-end | jump-none | jump-both | start | end"
      },
      {
        name: "<same-level>",
        type: "type",
        value: "<other-at-same-level>"
      },
      {
        name: "<other-at-same-level>",
        type: "type",
        value: "foo"
      }
    ]
  },

  {
    title: "detects equal signs that are not production rules",
    html: `<div class="prod">
        <dfn data-dfn-type="type">&lt;equal&gt;</dfn>
          = equal | '='
        <br/>
        <dfn data-dfn-type="type">&lt;also-equal&gt;</dfn> = '=' | equal
      </div>`,
    propertyName: "values",
    css: [
      {
        name: "<equal>",
        type: "type",
        value: "equal | '='"
      },
      {
        name: "<also-equal>",
        type: "type",
        value: "'=' | equal"
      }
    ]
  },

  {
    title: "does not choke on equal signs that are in prose",
    html: `<div class="prod">
        <p>The <dfn data-dfn-type="type">&lt;decibel&gt;</dfn> type denotes
        a dimension with a "dB" (decibel unit) unit identifier. Decibels
        represent the ratio of the squares of the new signal amplitude
        <var>a1</var> and the current amplitude <var>a0</var>,
        as per the following logarithmic equation:
        volume(dB) = 20 × log10(<var>a1</var> / <var>a0</var>).</p>
      </div>`,
    propertyName: "values",
    css: [{
        name: "<decibel>",
        type: "type",
        prose: "The <decibel> type denotes a dimension with a \"dB\" (decibel unit) unit identifier. Decibels represent the ratio of the squares of the new signal amplitude a1 and the current amplitude a0, as per the following logarithmic equation: volume(dB) = 20 × log10(a1 / a0)."
    }]
  },

  {
    title: "parses selectors definitions",
    html: `
    <p>
      The <dfn data-dfn-type="selector" data-export>:open</dfn> pseudo-class represents an
      element that has both “open” and “closed” states, and which is currently
      in the “open” state.
    </p>
    <p>
      The <dfn data-dfn-type="selector" data-export>:closed</dfn> pseudo-class represents an
      element that has both “open” and “closed” states, and which is currently
      in the “closed” state.
    </p>
    <p>
      The <dfn data-dfn-type="selector">:schrödinger</dfn> internal pseudo-class represents an
      element that has both “open” and “closed” states, and which is currently
      in an undetermined state.
    </p>
    `,
    propertyName: "selectors",
    css: [
      {
        name: ":open",
        prose: "The :open pseudo-class represents an element that has both “open” and “closed” states, and which is currently in the “open” state."
      },
      {
        name: ":closed",
        prose: "The :closed pseudo-class represents an element that has both “open” and “closed” states, and which is currently in the “closed” state."
      }
    ]
  },

  {
    title: 'parses a "value" definition for a "property"',
    html: `
    <table class="def propdef" data-link-for-hint="animation-name">
    <tbody>
     <tr>
      <th>Name:
      </th><td><dfn class="dfn-paneled css" data-dfn-type="property" data-export="" id="propdef-animation-name">animation-name</dfn>
     </td></tr><tr class="value">
      <th><a href="https://www.w3.org/TR/css-values/#value-defs">Value:</a>
      </th><td class="prod">[ none <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one">|</a> <a class="production css" data-link-type="type" href="#typedef-keyframes-name" id="ref-for-typedef-keyframes-name①">&lt;keyframes-name&gt;</a> ]<a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#mult-comma" id="ref-for-mult-comma">#</a>
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-cascade/#initial-values">Initial:</a>
      </th><td>none
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-cascade/#applies-to">Applies to:</a>
      </th><td><a href="https://www.w3.org/TR/css-pseudo/#generated-content" title="Includes ::before and ::after pseudo-elements.">all elements</a>
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-cascade/#inherited-property">Inherited:</a>
      </th><td>no
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-values/#percentages">Percentages:</a>
      </th><td>N/A
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/css-cascade/#computed">Computed value:</a>
      </th><td>list, each item either a case-sensitive <a data-link-type="dfn" href="https://drafts.csswg.org/css-values-4/#css-css-identifier" id="ref-for-css-css-identifier">css identifier</a> or the keyword <a class="css" data-link-type="maybe" href="#valdef-animation-name-none" id="ref-for-valdef-animation-name-none①">none</a>
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/cssom/#serializing-css-values">Canonical order:</a>
      </th><td>per grammar
     </td></tr><tr>
      <th><a href="https://www.w3.org/TR/web-animations/#animation-type">Animation type:</a>
      </th><td>not animatable
    </td></tr></tbody></table>
    <dl>
    <dt><dfn class="dfn-paneled css" data-dfn-for="animation-name" data-dfn-type="value" data-export="" id="valdef-animation-name-none">none</dfn>
    </dt><dd> No keyframes are specified at all, so there will be no animation.
      Any other animations properties specified for this animation have no effect.
    </dd><dt><dfn class="css" data-dfn-for="animation-name" data-dfn-type="value" data-export="" id="valdef-animation-name-keyframes-name"><a class="production css" data-link-type="type" href="#typedef-keyframes-name" id="ref-for-typedef-keyframes-name②">&lt;keyframes-name&gt;</a><a class="self-link" href="#valdef-animation-name-keyframes-name"></a></dfn>
    </dt><dd> The animation will use the keyframes with the name specified by the <a class="production css" data-link-type="type" href="#typedef-keyframes-name" id="ref-for-typedef-keyframes-name③">&lt;keyframes-name&gt;</a>,
      if they exist.
      If no <a class="css" data-link-type="maybe" href="#at-ruledef-keyframes" id="ref-for-at-ruledef-keyframes⑧">@keyframes</a> rule with that name exists, there is no animation.
    </dd></dl>
    `,
    css: [{
      "name": "animation-name",
      "animationType": "not animatable",
      "appliesTo": "all elements",
      "canonicalOrder": "per grammar",
      "computedValue": "list, each item either a case-sensitive css identifier or the keyword none",
      "inherited": "no",
      "initial": "none",
      "percentages": "N/A",
      "value": "[ none | <keyframes-name> ]#",
      "values": [
        {
          "name": "none",
          "prose": "No keyframes are specified at all, so there will be no animation. Any other animations properties specified for this animation have no effect.",
          "type": "value",
          "value": "none"
        },
        {
          "name": "<keyframes-name>",
          "prose": "The animation will use the keyframes with the name specified by the <keyframes-name>, if they exist. If no @keyframes rule with that name exists, there is no animation.",
          "type": "value",
          "value": "<keyframes-name>"
        }
      ]
    }]
  },

  {
    title: 'parses a "value" definition for a "descriptor"',
    html: `
    <p>The <dfn data-dfn-type="at-rule">@counter-style</dfn> rule allows authors
    to define a custom counter style.</p>
    <table class="def descdef">
    <tbody>
     <tr>
      <th>Name:
      </th><td><dfn class="css" data-dfn-for="@counter-style" data-dfn-type="descriptor" data-export="" id="descdef-counter-style-system">system<a class="self-link" href="#descdef-counter-style-system"></a></dfn>
     </td></tr><tr>
      <th>For:
      </th><td><a class="css" data-link-type="at-rule" href="#at-ruledef-counter-style" id="ref-for-at-ruledef-counter-style①④">@counter-style</a>
     </td></tr><tr>
      <th>Value:
      </th><td class="prod">cyclic <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one">|</a> numeric <span id="ref-for-comb-one①">|</span> alphabetic <span id="ref-for-comb-one②">|</span> symbolic <span id="ref-for-comb-one③">|</span> additive <span id="ref-for-comb-one④">|</span> <span class="nobr">[fixed <a class="production css" data-link-type="type" href="https://drafts.csswg.org/css-values-4/#integer-value" id="ref-for-integer-value">&lt;integer&gt;</a><a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#mult-opt" id="ref-for-mult-opt">?</a>]</span> <span id="ref-for-comb-one⑤">|</span> <span class="nobr">[ extends <a class="production css" data-link-type="type" href="#typedef-counter-style-name" id="ref-for-typedef-counter-style-name③" title="Expands to: arabic-indic | armenian | bengali | cambodian | circle | cjk-decimal | cjk-earthly-branch | cjk-heavenly-stem | decimal | decimal-leading-zero | devanagari | disc | disclosure-closed | disclosure-open | ethiopic-numeric | georgian | gujarati | gurmukhi | hebrew | hiragana | hiragana-iroha | kannada | katakana | katakana-iroha | khmer | korean-hangul-formal | korean-hanja-formal | korean-hanja-informal | lao | lower-alpha | lower-armenian | lower-greek | lower-latin | lower-roman | malayalam | mongolian | myanmar | oriya | persian | square | tamil | telugu | thai | tibetan | upper-alpha | upper-armenian | upper-latin | upper-roman">&lt;counter-style-name&gt;</a> ]</span>
     </td></tr><tr>
      <th>Initial:
      </th><td>symbolic
   </td></tr></tbody></table>
   <p>The <dfn data-dfn-for="@counter-style/system" data-dfn-type="value">cyclic</dfn>
   counter system cycles repeatedly through its provided symbols.</p>
    `,
    propertyName: 'atrules',
    css: [{
      name: '@counter-style',
      prose: 'The @counter-style rule allows authors to define a custom counter style.',
      descriptors: [
        {
          name: 'system',
          for: '@counter-style',
          initial: 'symbolic',
          value: 'cyclic | numeric | alphabetic | symbolic | additive | [fixed <integer>?] | [ extends <counter-style-name> ]',
          values: [
            {
              name: 'cyclic',
              type: 'value',
              value: 'cyclic',
              prose: 'The cyclic counter system cycles repeatedly through its provided symbols.'
            }
          ]
        }
      ]
    }]
  },

  {
    title: 'parses "value" definitions for a "type"',
    html: `
    <pre class="prod">
      <dfn data-dfn-type="type">&lt;font-weight-absolute&gt;</dfn> = [normal | bold | &lt;number [1,1000]&gt;]
    </pre>
    <dl>
    <dt><dfn data-dfn-for="&lt;font-weight-absolute&gt;" data-dfn-type="value">&lt;number [1,1000]&gt;</dfn>
    </dt><dd>
      Each number indicates a weight that is at least as dark as its predecessor.
    </dd><dt><dfn data-dfn-for="&lt;font-weight-absolute&gt;" data-dfn-type="value">normal</dfn>
    </dt><dd>Same as <span class="css">400</span>.
    </dd></dl>
    `,
    propertyName: 'values',
    css: [{
      name: '<font-weight-absolute>',
      type: 'type',
      value: '[normal | bold | <number [1,1000]>]',
      values: [
        {
          name: '<number [1,1000]>',
          type: 'value',
          prose: 'Each number indicates a weight that is at least as dark as its predecessor.',
          value: '<number [1,1000]>',
        },
        {
          name: 'normal',
          type: 'value',
          prose: 'Same as 400.',
          value: 'normal'
        }
      ]
    }]
  },

  {
    title: 'parses "type" and "function" definitions for a "type"',
    html: `
    <pre class="prod">
      <dfn data-dfn-type="type">&lt;my-type&gt;</dfn> =
        &lt;my-function()> &lt;my-subtype>
      <dfn data-dfn-type="function" data-dfn-for="&lt;my-type&gt;">my-function()</dfn> = my-function(takes parameters)
      <dfn data-dfn-type="type" data-dfn-for="&lt;my-type&gt;">&lt;my-subtype&gt;</dfn> = none | auto
    </pre>
    `,
    propertyName: 'values',
    css: [{
      name: '<my-type>',
      type: 'type',
      value: '<my-function()> <my-subtype>',
      values: [
        {
          name: 'my-function()',
          type: 'function',
          value: 'my-function(takes parameters)'
        },
        {
          name: '<my-subtype>',
          type: 'type',
          value: 'none | auto'
        }
      ]
    }]
  },

  {
    title: 'does not choke on empty data-dfn-for attributes',
    html: `
    <pre class="prod">
      <dfn data-dfn-type="type" data-dfn-for="">&lt;my-type&gt;</dfn> =
      &lt;my-function()> &lt;my-subtype>
    </pre>
    `,
    propertyName: 'values',
    css: [{
      name: '<my-type>',
      type: 'type',
      value: '<my-function()> <my-subtype>'
    }]
  },

  {
    title: 'associates values with the deepest structure it is for',
    html: `
    <pre class="prod">
      <dfn data-dfn-type="type">&lt;my-type&gt;</dfn> = &lt;my-subtype>
      <dfn data-dfn-type="type">&lt;my-subtype&gt;</dfn> = none | auto
    </pre>
    <p>The <dfn data-dfn-type="value" data-dfn-for="&lt;my-type&gt;,&lt;my-subtype&gt;">none</dfn>
      value is fantastic.</p>
    <p>The <dfn data-dfn-type="value" data-dfn-for="&lt;my-type&gt;,&lt;my-subtype&gt;">auto</dfn>
      value is also fantastic.</p>
    `,
    propertyName: 'values',
    css: [
      {
        name: '<my-type>',
        type: 'type',
        value: '<my-subtype>'
      },
      {
        name: '<my-subtype>',
        type: 'type',
        value: 'none | auto',
        values: [
          {
            name: 'none',
            type: 'value',
            value: 'none',
            prose: 'The none value is fantastic.'
          },
          {
            name: 'auto',
            type: 'value',
            value: 'auto',
            prose: 'The auto value is also fantastic.'
          }
        ]
      }
    ]
  },

  {
    title: 'does find a deepest structure for values',
    html: `
    <pre class="prod">
      <dfn data-dfn-type="type">&lt;gradient&gt;</dfn> = radial-gradient() | repeating-radial-gradient()
    </pre>
    <p><dfn data-dfn-type="function">radial-gradient()</dfn> is nice.</p>
    <p><dfn data-dfn-type="function">repeating-radial-gradient()</dfn> is nice too.</p>
    <p>The <dfn data-dfn-type="value" data-dfn-for="radial-gradient(),repeating-radial-gradient()">&lt;extent-keyword></dfn>
      value is fantastic.</p>
    `,
    propertyName: 'values',
    css: [
      {
        name: '<gradient>',
        type: 'type',
        value: 'radial-gradient() | repeating-radial-gradient()'
      },
      {
        name: 'radial-gradient()',
        type: 'function',
        prose: 'radial-gradient() is nice.',
        values: [
          {
            name: '<extent-keyword>',
            type: 'value',
            value: '<extent-keyword>',
            prose: 'The <extent-keyword> value is fantastic.'
          }
        ]
      },
      {
        name: 'repeating-radial-gradient()',
        type: 'function',
        prose: 'repeating-radial-gradient() is nice too.',
        values: [
          {
            name: '<extent-keyword>',
            type: 'value',
            value: '<extent-keyword>',
            prose: 'The <extent-keyword> value is fantastic.'
          }
        ]
      }
    ]
  },

  {
    title: 'issues a warning when a definition is missing',
    html: `
    <pre class="prod">&lt;my-type&gt; = none | auto
    `,
    propertyName: 'warnings',
    css: [{
      msg: 'Missing definition',
      name: '<my-type>',
      value: 'none | auto'
    }]
  },

  {
    title: 'issues a warning when it bumps into a duplicated definition',
    html: `
    <p><dfn data-dfn-type='type'>&lt;my-type&gt;</dfn> is defined a first time.</p>
    <p><dfn data-dfn-type='type'>&lt;my-type&gt;</dfn> is defined a second time.</p>
    `,
    propertyName: 'warnings',
    css: [{
      msg: 'Duplicate definition',
      name: '<my-type>',
      type: 'type',
      prose: '<my-type> is defined a second time.'
    }]
  },

  {
    title: 'issues a warning when a value is dangling',
    html: `
    <p>The <dfn data-dfn-type="value" data-dfn-for="my-property">dangling</dfn>
    value is dangling.</p>
    `,
    propertyName: 'warnings',
    css: [{
      msg: 'Dangling value',
      name: 'dangling',
      for: 'my-property',
      type: 'value',
      value: 'dangling',
      prose: 'The dangling value is dangling.'
    }]
  },

  {
    title: "issues a warning when a property is defined more than once and cannot be merged",
    html: `
      <table class="def propdef" data-link-for-hint="scrollbar-gutter"><tbody>
       <tr>
        <th>Name:
        </th><td><dfn class="dfn-paneled css" data-dfn-type="property" data-export="" id="propdef-scrollbar-gutter">scrollbar-gutter</dfn>
       </td></tr><tr class="value">
        <th><a href="https://www.w3.org/TR/css-values/#value-defs">Value:</a>
        </th><td class="prod">auto <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one">|</a> stable <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-all" id="ref-for-comb-all">&amp;&amp;</a> mirror<a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#mult-opt" id="ref-for-mult-opt">?</a>
       </td></tr><tr>
        <th><a href="https://www.w3.org/TR/css-cascade/#initial-values">Initial:</a>
        </th><td>auto
       </td></tr><tr>
        <th>Applies to:
        </th><td><a data-link-type="dfn" href="https://drafts.csswg.org/css-overflow-3/#scroll-container" id="ref-for-scroll-container">scroll containers</a>
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
        </td></tr>
      </tbody></table>
      <table class="def propdef partial" data-link-for-hint="scrollbar-gutter">
       <tbody>
        <tr>
         <th>Name:
         </th><td><a class="css" data-link-type="property" href="#propdef-scrollbar-gutter" id="ref-for-propdef-scrollbar-gutter①⓪">scrollbar-gutter</a>
        </td></tr><tr class="value">
         <th><a href="https://www.w3.org/TR/css-values/#value-defs">New values:</a>
         </th><td class="prod">auto <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-one" id="ref-for-comb-one①⓪">|</a> [ [ stable <span id="ref-for-comb-one①①">|</span> always ] <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-all" id="ref-for-comb-all①">&amp;&amp;</a> mirror<a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#mult-opt" id="ref-for-mult-opt①">?</a> <span id="ref-for-comb-all②">&amp;&amp;</span> force<span id="ref-for-mult-opt②">?</span> ] <a data-link-type="grammar" href="https://drafts.csswg.org/css-values-4/#comb-any" id="ref-for-comb-any">||</a> match-parent
        </td></tr><tr>
          <th><a href="https://www.w3.org/TR/css-cascade/#initial-values">Initial:</a>
          </th><td>A different initial value
         </td></tr><tr>
         <th>Applies to:
         </th><td><a href="https://www.w3.org/TR/css-pseudo/#generated-content" title="Includes ::before and ::after pseudo-elements.">all elements</a>
        </td></tr>
       </tbody>
      </table>`,
    propertyName: "warnings",
    css: [{
      msg: 'Unmergeable definition',
      name: "scrollbar-gutter",
      appliesTo: 'all elements',
      initial: 'A different initial value',
      newValues: 'auto | [ [ stable | always ] && mirror? && force? ] || match-parent'
    }]
  },

  {
    title: 'keeps the "type" of descriptors if so defined',
    html: `
    <table class="def descdef mq">
    <tbody>
     <tr>
      <th>Name:
      </th><td><dfn class="dfn-paneled css" data-dfn-for="@media" data-dfn-type="descriptor">-webkit-device-pixel-ratio</dfn>
     </td></tr><tr>
      <th>For:
      </th><td>@media
     </td></tr><tr>
      <th>Value:
      </th><td class="prod">&lt;number&gt;
     </td></tr><tr>
      <th>Type:
      </th><td>range
   </td></tr></tbody></table>
    `,
    propertyName: 'atrules',
    css: [{
      name: '@media',
      descriptors: [{
        name: '-webkit-device-pixel-ratio',
        for: '@media',
        value: '<number>',
        type: 'range'
      }]
    }]
  },

  {
    title: 'handles cycles in value references',
    html: `
    <pre class="prod">
      <dfn data-dfn-type="type">&lt;my-type&gt;</dfn> = &lt;my-subtype>
      <dfn data-dfn-type="type" data-dfn-for="&lt;my-type&gt;">&lt;my-subtype&gt;</dfn> = none | auto | &lt;recurring-type&gt;
      <dfn data-dfn-type="type" data-dfn-for="&lt;my-subtype&gt;">&lt;recurring-type&gt;</dfn> = &lt;my-type&gt;
    </pre>
    `,
    propertyName: 'values',
    css: [{
      name: '<my-type>',
      type: 'type',
      value: '<my-subtype>',
      values: [
        {
          name: '<my-subtype>',
          type: 'type',
          value: 'none | auto | <recurring-type>',
          values: [
            {
              name: '<recurring-type>',
              type: 'type',
              value: '<my-type>'
            }
          ]
        }
      ]
    }]
  },

  {
    title: 'skips production rules of IDL blocks in HTML spec',
    html: `
    <pre>
      <code class="idl">
        <dfn>&lt;not-a-css-type&gt;</dfn> = blah
      </code>
    </pre>
    `,
    propertyName: 'values',
    css: []
  },

  {
    title: 'does not report production rules of IDL blocks in HTML spec as warnings',
    html: `
    <pre>
      <code class="idl">
        <dfn>&lt;not-a-css-type&gt;</dfn> = blah
      </code>
    </pre>
    `,
    propertyName: 'warnings',
    css: undefined
  },

  {
    title: 'skips production rules that are not of the right type',
    html: `
    <pre>
      <dfn data-dfn-type="dfn">&lt;not-a-css-type&gt;</dfn> = none | auto
    </pre>
    `,
    propertyName: 'values',
    css: []
  },

  {
    title: 'does not report production rules that are not of the right type as warnings',
    html: `
    <pre>
      <dfn data-dfn-type="dfn">&lt;not-a-css-type&gt;</dfn> = none | auto
    </pre>
    `,
    propertyName: 'warnings',
    css: undefined
  },

  {
    title: 'normalizes values ("−" to "-")',
    html: `
    <pre>
      <dfn data-dfn-type="type">&lt;my-type&gt;</dfn> = none | oblique &lt;angle [−90deg,90deg]&gt;?
    </pre>
    `,
    propertyName: 'values',
    css: [{
      name: '<my-type>',
      type: 'type',
      value: 'none | oblique <angle [-90deg,90deg]>?'
    }]
  },

  {
    title: 'normalizes values at a deeper level ("−" to "-")',
    html: `
    <pre>
      <dfn data-dfn-type="type">&lt;my-type&gt;</dfn> = none | oblique &lt;angle [−90deg,90deg]&gt;?</dfn>
    </pre>
    <p>
      The <dfn data-dfn-type="value" data-dfn-for="&lt;my-type&gt;">oblique &lt;angle [−90deg,90deg]&gt;?</dfn>
      value is super.
    </p>
    `,
    propertyName: 'values',
    css: [{
      name: '<my-type>',
      type: 'type',
      value: 'none | oblique <angle [-90deg,90deg]>?',
      values: [{
        name: 'oblique <angle [−90deg,90deg]>?',
        type: 'value',
        value: 'oblique <angle [-90deg,90deg]>?',
        prose: 'The oblique <angle [−90deg,90deg]>? value is super.'
      }]
    }]
  },

  {
    title: 'extracts a child selector',
    html: `
    <p>The <dfn data-dfn-type="selector" data-export>::first-letter</dfn>
    pseudo-element represents the first letter.</p>
    <p>The <dfn data-dfn-type="selector" data-export data-dfn-for="::first-letter">::prefix</dfn>
    represents the preceding punctuation of the ::first-letter element.</p>
    `,
    propertyName: 'selectors',
    css: [{
      name: '::first-letter',
      prose: 'The ::first-letter pseudo-element represents the first letter.',
      values: [{
        name: '::prefix',
        type: 'selector',
        prose: 'The ::prefix represents the preceding punctuation of the ::first-letter element.'
      }]
    }]
  },

  {
    title: 'extracts right linking text for a "type" definition',
    html: `
    <p><dfn data-dfn-type="type" data-lt="identifiers|<identifier>" data-export>identifiers</dfn>
    are a fantastic type.</p>
    `,
    propertyName: 'values',
    css: [{
      name: '<identifier>',
      type: 'type',
      prose: 'identifiers are a fantastic type.'
    }]
  },

  {
    title: 'extracts right linking text for a "value" definition',
    html: `
    <p><dfn data-dfn-type="type">&lt;my-type&gt;</dfn> is my type.</p>
    <p><dfn data-dfn-type="value" data-lt="value|val" data-dfn-for="<my-type>">val</dfn>
    is an interesting value.</p>
    `,
    propertyName: 'values',
    css: [{
      name: '<my-type>',
      type: 'type',
      prose: '<my-type> is my type.',
      values: [{
        name: 'val',
        type: 'value',
        prose: 'val is an interesting value.',
        value: 'val'
      }]
    }]
  },

  {
    title: 'throws when definition defines multiple linking texts without any obvious one',
    html: `
    <p><dfn data-dfn-type="type" data-lt="a|b|c" data-export>ABC</dfn>, it's
    easy.</p>
    `,
    error: 'Found multiple linking texts for dfn without any obvious one: a, b, c'
  },

  {
    title: 'extracts a function value from the right hand side of a production rule',
    html: `
    <pre class="prod">
      <dfn data-dfn-type="type" data-export="">&lt;linear-easing-function&gt;</dfn> = <dfn data-dfn-type="function" data-export="" data-lt="linear()">linear(&lt;linear-stop-list&gt;)</dfn>
    </pre>
    `,
    propertyName: 'values',
    css: [
      {
        name: '<linear-easing-function>',
        type: 'type',
        value: 'linear(<linear-stop-list>)'
      },
      {
        name: 'linear()',
        type: 'function',
        value: 'linear(<linear-stop-list>)'
      }
    ]
  },

  {
    title: 'extracts a production rule defined in code in a dd',
    html: `
    <dl>
      <dt><dfn data-dfn-type="type" data-export="">&lt;my-type&gt;</dfn></dt>
      <dd>
        <p><code class="prod">none | auto</code> are the values.
      </dd>
    </dl>
    `,
    propertyName: 'values',
    css: [
      {
        name: '<my-type>',
        type: 'type',
        value: 'none | auto'
      }
    ]
  },

  {
    title: 'does not extract arbitrary code defined in a dd',
    html: `
    <dl>
      <dt><dfn data-dfn-type="type" data-export="">&lt;my-type&gt;</dfn></dt>
      <dd>
        <p><code>42</code> is not a value of &lt;my-type&gt;.</p>
      </dd>
    </dl>
    `,
    propertyName: 'values',
    css: [
      {
        name: '<my-type>',
        type: 'type',
        prose: '42 is not a value of <my-type>.'
      }
    ]
  },

  {
    title: 'does not get confused by informative code in dd',
    html: `
    <dl>
      <dt><dfn data-dfn-type="type" data-export="">&lt;my-type&gt;</dfn></dt>
      <dd>
        &lt;my-type&gt; is my type.
        <div class="example">
          <p class="prod"><code>foo</code> is not the value of &lt;my-type&gt;.</p>
        </div>
      </dd>
    </dl>
    `,
    propertyName: 'values',
    css: [
      {
        name: '<my-type>',
        type: 'type',
        prose: '<my-type> is my type. foo is not the value of <my-type>.'
      }
    ]
  },

  {
    title: 'normalizes function-like selectors names',
    html: `
    <p><dfn data-dfn-type="selector" data-export="">::blah( &lt;my-type&gt; )</dfn>
    is a selector that takes <code>&lt;my-type&gt;</code> as input.</p>
    `,
    propertyName: 'selectors',
    css: [{
      name: '::blah()',
      value: '::blah( <my-type> )'
    }]
  },

  {
    title: 'parses a partial property definition',
    html: `<table class="def propdef partial">
      <tbody>
        <tr>
          <th>Name:</th>
          <td>text-transform</td>
        </tr>
        <tr class="value">
          <th>New values:</th>
          <td class="prod">math-auto</td>
        </tr>
      </tbody>
    </table>
    `,
    css: [{
      name: 'text-transform',
      newValues: 'math-auto'
    }]
  },

  {
    title: 'parses a partial property definition that (singular variant)',
    html: `<table class="def propdef partial">
      <tbody>
        <tr>
          <th>Name:</th>
          <td>text-transform</td>
        </tr>
        <tr class="value">
          <th>New value:</th>
          <td class="prod">math-auto</td>
        </tr>
      </tbody>
    </table>
    `,
    css: [{
      name: 'text-transform',
      newValues: 'math-auto'
    }]
  }
];

describe("Test CSS properties extraction", function() {
  this.slow(5000);
  this.timeout(10000);
  let browser;
  let extractCSSCode;
  const validateSchema = getSchemaValidationFunction('extract-cssdfn');

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
      const pageContent = t.html;
      page.setContent(pageContent);
      await page.addScriptTag({ content: extractCSSCode });

      const extractedCss = await page.evaluate(async () => {
        try {
          return extractCSS();
        }
        catch (err) {
          return { error: err.message };
        }
      });
      await page.close();

      if (t.error) {
        assert.deepEqual(extractedCss, { error: t.error });
      }
      else {
        assert.deepEqual(extractedCss[t.propertyName ?? 'properties'], t.css);
        const errors = validateSchema(extractedCss);
        assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
      }
    });
  });

  after(async () => {
    await browser.close();
  });
});

