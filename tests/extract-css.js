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
    css: {}
  },

  {
    title: "parses a valuespace prose definition",
    html: `<dl>
    <dt><dfn class="css" data-dfn-for="text-indent" data-dfn-type="type" data-export="" id="valdef-text-indent-percentage">&lt;percentage&gt;<a class="self-link" href="#valdef-text-indent-percentage"></a></dfn> 
    </dt><dd>
      Gives the amount of the indent
      as a percentage of the block container’s own <a data-link-type="dfn" href="https://drafts.csswg.org/css-writing-modes-4/#logical-width" id="ref-for-logical-width">logical width</a>. 
     <p>Percentages must be treated as <span class="css">0</span> for the purpose of calculating <a data-link-type="dfn" href="https://drafts.csswg.org/css-sizing-3/#intrinsic-size-contribution" id="ref-for-intrinsic-size-contribution">intrinsic size contributions</a>,
      but are always resolved normally when performing layout.</p>
    </dd></dl>`,
    propertyName: "valuespaces",
    css: {
      "<percentage>": {
        "prose": "Gives the amount of the indent as a percentage of the block container’s own logical width. Percentages must be treated as 0 for the purpose of calculating intrinsic size contributions, but are always resolved normally when performing layout."
      }
    }
  },

  {
    title: "ignores a valuespace prose definition in an informative section",
    html: `<div class="note"><dl>
    <dt><dfn class="css" data-dfn-for="text-indent" data-dfn-type="value" data-export="" id="valdef-text-indent-percentage">&lt;percentage&gt;<a class="self-link" href="#valdef-text-indent-percentage"></a></dfn> 
    </dt><dd>
      Gives the amount of the indent
      as a percentage of the block container’s own <a data-link-type="dfn" href="https://drafts.csswg.org/css-writing-modes-4/#logical-width" id="ref-for-logical-width">logical width</a>. 
     <p>Percentages must be treated as <span class="css">0</span> for the purpose of calculating <a data-link-type="dfn" href="https://drafts.csswg.org/css-sizing-3/#intrinsic-size-contribution" id="ref-for-intrinsic-size-contribution">intrinsic size contributions</a>,
      but are always resolved normally when performing layout.</p>
    </dd></dl></div>`,
    propertyName: "valuespaces",
    css: {}
  },

  {
    title: "parses a valuespace prose definition, excluding tests and notes",
    html: `<dl>
    <dt><dfn class="css" data-dfn-for="text-indent" data-dfn-type="type" data-export="" id="valdef-text-indent-percentage">&lt;percentage&gt;<a class="self-link" href="#valdef-text-indent-percentage"></a></dfn> 
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
     <dt data-md=""><dfn class="css" data-dfn-for="ray()" data-dfn-type="type" data-export="" id="valdef-ray-size">&lt;size&gt;<a class="self-link" href="#valdef-ray-size"></a></dfn>
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
  },


  {
    title: "ignores a valuespace definition when data-dfn-type is not correct",
    html: `<div class="note"><dl>
    <dt><dfn class="css" data-dfn-type="value">value</dfn></dt>
    <dd>Value</dd>
    <dt><dfn class="css" data-dfn-type="selector">selector</dfn></dt>
    <dd>Selector</dd>
    <dt><dfn class="css" data-dfn-type="at-rule">at-rule</dfn></dt>
    <dd>Selector</dd>
    </dl></div>`,
    propertyName: "valuespaces",
    css: {}
  },

  {
    title: "knows that second definition of rgb() is legacy",
    html: `
      <pre class="prod">
        &lt;rgb()> = rgb( modern )
      </pre>
      <pre class="prod">
        &lt;rgb()> = rgb( legacy )
      </pre>
    `,
    propertyName: "valuespaces",
    css: {
      "<rgb()>": {
        "value": "rgb( modern )",
        "legacyValue": "rgb( legacy )"
      }
    }
  },

  {
    title: "extracts an at-rule syntax",
    html: `
      <pre class="prod">
        @layer <a class="production">&lt;layer-name&gt;</a>? {
          <a class="production">&lt;stylesheet&gt;</a>
        }
      </pre>
    `,
    propertyName: "atrules",
    css: {
      "@layer": {
        "value": "@layer <layer-name>? { <stylesheet> }",
        "descriptors": []
      }
    }
  },

  {
    title: "extracts an at-rule syntax with multiple definitions",
    html: `
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
    css: {
      "@layer": {
        "value": "@layer <layer-name>? { <stylesheet> } | @layer <layer-name>#;",
        "descriptors": []
      }
    }
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
    css: {
      "@font-face": {
        "value": "@font-face { <declaration-list> }",
        "descriptors": [
          {
            for: "@font-face",
            initial: "auto",
            name: "font-display",
            value: "auto | block | swap | fallback | optional"
          }
        ]
      }
    }
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
    css: {
      "@font-face": {
        "descriptors": [
          {
            for: "@font-face",
            initial: "auto",
            name: "font-display",
            value: "auto | block | swap | fallback | optional"
          }
        ]
      },
      "@font-feature-values": {
        "descriptors": [
          {
            for: "@font-feature-values",
            initial: "auto",
            name: "font-display",
            value: "auto | block | swap | fallback | optional"
          }
        ]
      }
    }
  },


  {
    title: "throws when a property is defined more than once and cannot be merged",
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
    error: 'More than one dfn found for CSS property \"scrollbar-gutter\" and dfns cannot be merged'
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
    css: {}
  },

  {
    title: "ignores comments",
    html: `<pre class="prod">&lt;page-selector-list> = &lt;page-selector>#
/* A comment */
&lt;page-selector> = [ &lt;ident-token>? &lt;pseudo-page>* ]!
&lt;pseudo-page> = ':' [ left | right | first | blank ] /* Another comment */

/* Yet another one
that spans multiple lines */
@top-left-corner = @top-left-corner { &lt;declaration-list> };
</pre>`,
    propertyName: "valuespaces",
    css: {
      "<page-selector-list>": {
        value: "<page-selector>#"
      },
      "<page-selector>": {
        value: "[ <ident-token>? <pseudo-page>* ]!"
      },
      "<pseudo-page>": {
        value: "':' [ left | right | first | blank ]"
      }
    }
  },

  {
    title: "parses syntax value preferably",
    html: `<div>
      <p>
        <dfn data-dfn-type="function" data-lt="&lt;toto()>">&lt;toto(A)></dfn> is a super function.</dfn>
      </p>
      <pre class="prod"><code>
        &lt;toto()> = toto( &lt;integer> )
      </code></pre>`,
    propertyName: "valuespaces",
    css: {
      "<toto()>": {
        prose: "<toto(A)> is a super function.",
        value: "toto( <integer> )"
      }
    }
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
    propertyName: "valuespaces",
    css: {
      "<step-easing-function>": {
        value: "step-start | step-end | steps(<integer>[, <step-position>]?)"
      },
      "<step-position>": {
        value: "jump-start | jump-end | jump-none | jump-both | start | end"
      },
      "<same-level>": {
        value: "<other-at-same-level>"
      },
      "<other-at-same-level>": {
        value: "foo"
      }
    }
  },

  {
    title: "detects equal signs that are not production rules",
    html: `<div class="prod">
        <dfn data-dfn-type="type">&lt;equal&gt;</dfn>
          = equal | '='
        <br/>
        <dfn data-dfn-type="type">&lt;also-equal&gt;</dfn> = '=' | equal
      </div>`,
    propertyName: "valuespaces",
    css: {
      "<equal>": {
        value: "equal | '='"
      },
      "<also-equal>": {
        value: "'=' | equal"
      }
    }
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
    propertyName: "valuespaces",
    css: {
      "<decibel>": {
        prose: "The <decibel> type denotes a dimension with a \"dB\" (decibel unit) unit identifier. Decibels represent the ratio of the squares of the new signal amplitude a1 and the current amplitude a0, as per the following logarithmic equation: volume(dB) = 20 × log10(a1 / a0)."
      }
    }
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

