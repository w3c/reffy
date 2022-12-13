const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');
const { getSchemaValidationFunction } = require('../src/lib/util');

const tests = [
  {
    title: "extracts an HTML element that defines its own interface",
    spec: "html",
    html: `<h4 id="the-p-element"><span class="secno">4.4.1</span> The <dfn><code>p</code></dfn> element<a href="#the-p-element" class="self-link"></a></h4>
<dl class="element">
<dt><a href="dom.html#concept-element-dom" id="the-p-element:concept-element-dom">DOM interface</a>:</dt>
<dd>
    <pre><code class="idl">[<c- g="">Exposed</c->=<c- n="">Window</c->]
<c- b="">interface</c-> <dfn id="htmlparagraphelement"><c- g="">HTMLParagraphElement</c-></dfn> : <a id="the-p-element:htmlelement" href="dom.html#htmlelement"><c- n="">HTMLElement</c-></a> {
  [<a id="the-p-element:htmlconstructor" href="dom.html#htmlconstructor"><c- g="">HTMLConstructor</c-></a>] <c- g="">constructor</c->();

  // <a href="obsolete.html#HTMLParagraphElement-partial">also has obsolete members</a>
};</code></pre>
   </dd>
</dl>`,
    res: [
      {
        name: "p",
        interface: "HTMLParagraphElement"
      }
    ]
  },

  {
    title: "extracts an HTML element that uses another interface",
    spec: "html",
    html: `<h4 id="the-thead-element"><span class="secno">4.9.6</span> The <dfn><code>thead</code></dfn> element<a href="#the-thead-element" class="self-link"></a></h4>
<dl class="element">
<dt><a href="dom.html#concept-element-categories" id="the-thead-element:concept-element-categories">Categories</a>:</dt>
<dd>None.</dd>
<dt><a href="dom.html#concept-element-contexts" id="the-thead-element:concept-element-contexts">Contexts in which this element can be used</a>:</dt>
<dd>As a child of a <code id="the-thead-element:the-table-element"><a href="#the-table-element">table</a></code> element, after any
   <code id="the-thead-element:the-caption-element"><a href="#the-caption-element">caption</a></code>, and <code id="the-thead-element:the-colgroup-element"><a href="#the-colgroup-element">colgroup</a></code>
   elements and before any <code id="the-thead-element:the-tbody-element"><a href="#the-tbody-element">tbody</a></code>, <code id="the-thead-element:the-tfoot-element"><a href="#the-tfoot-element">tfoot</a></code>, and
   <code id="the-thead-element:the-tr-element"><a href="#the-tr-element">tr</a></code> elements, but only if there are no other
   <code id="the-thead-element:the-thead-element"><a href="#the-thead-element">thead</a></code> elements that are children of the
   <code id="the-thead-element:the-table-element-2"><a href="#the-table-element">table</a></code> element.</dd>
<dt><a href="dom.html#concept-element-content-model" id="the-thead-element:concept-element-content-model">Content model</a>:</dt>
<dd>Zero or more <code id="the-thead-element:the-tr-element-2"><a href="#the-tr-element">tr</a></code> and <a href="dom.html#script-supporting-elements-2" id="the-thead-element:script-supporting-elements-2">script-supporting</a> elements.</dd>
<dt><a href="dom.html#concept-element-tag-omission" id="the-thead-element:concept-element-tag-omission">Tag omission in text/html</a>:</dt>
<dd>A <code id="the-thead-element:the-thead-element-2"><a href="#the-thead-element">thead</a></code> element's <a href="syntax.html#syntax-end-tag" id="the-thead-element:syntax-end-tag">end tag</a> can be omitted if
   the <code id="the-thead-element:the-thead-element-3"><a href="#the-thead-element">thead</a></code> element is immediately followed by a <code id="the-thead-element:the-tbody-element-2"><a href="#the-tbody-element">tbody</a></code> or
   <code id="the-thead-element:the-tfoot-element-2"><a href="#the-tfoot-element">tfoot</a></code> element.</dd>
<dt><a href="dom.html#concept-element-attributes" id="the-thead-element:concept-element-attributes">Content attributes</a>:</dt>
<dd><a id="the-thead-element:global-attributes" href="dom.html#global-attributes">Global attributes</a></dd>
<dt><a href="dom.html#concept-element-accessibility-considerations" id="the-thead-element:concept-element-accessibility-considerations">Accessibility considerations</a>:</dt>
<dd><a href="https://w3c.github.io/html-aria/#el-thead">For authors</a>.</dd>
<dd><a href="https://w3c.github.io/html-aam/#el-thead">For implementers</a>.</dd>
<dt><a href="dom.html#concept-element-dom" id="the-thead-element:concept-element-dom">DOM interface</a>:</dt>
<dd>Uses <code id="the-thead-element:htmltablesectionelement"><a href="#htmltablesectionelement">HTMLTableSectionElement</a></code>, as defined for <code id="the-thead-element:the-tbody-element-3"><a href="#the-tbody-element">tbody</a></code> elements.</dd>
</dl>`,
    res: [
      {
        name: "thead",
        interface: "HTMLTableSectionElement"
      }
    ]
  },

  {
    title: "extracts grouped elements",
    spec: "html",
    html: `<h4 id="the-sub-and-sup-elements"><span class="secno">4.5.19</span> The <dfn id="the-sub-element" data-dfn-type="element"><code>sub</code></dfn> and <dfn id="the-sup-element" data-dfn-type="element"><code>sup</code></dfn> elements<a href="#the-sub-and-sup-elements" class="self-link"></a></h4>
<dl class="element"><dt><a href="dom.html#concept-element-dom" id="the-sub-and-sup-elements:concept-element-dom">DOM interface</a>:</dt><dd>Use <code id="the-sub-and-sup-elements:htmlelement"><a href="dom.html#htmlelement">HTMLElement</a></code>.</dd>
</dl>`,
    res: [
      {
        name: "sub",
        interface: "HTMLElement"
      },
      {
        name: "sup",
        interface: "HTMLElement"
      }
    ]
  },

  {
    title: "extracts an SVG element that follows the element-summary pattern",
    spec: "SVG2",
    html: `<div class="element-summary">
<div class="element-summary-name"><span class="element-name">‘<dfn data-dfn-type="element" data-export="" id="elementdef-animate">animate</dfn>’</span></div>
<dl>
  <dt>Categories:</dt>
  <dd><a href="#TermAnimationElement">Animation element</a></dd>
  <dt>Content model:</dt>
  <dd>Any number of the following elements, in any order:<ul class="no-bullets"><li><a href="https://svgwg.org/svg2-draft/struct.html#TermDescriptiveElement">descriptive elements</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="element-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#DescElement"><span>desc</span></a>’</span>, <span class="element-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#TitleElement"><span>title</span></a>’</span>, <span class="element-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#MetadataElement"><span>metadata</span></a>’</span></span></span></li></ul><span class="element-name"><a href="https://svgwg.org/svg2-draft/interact.html#ScriptElement"><span>script</span></a></span></dd>
  <dt>Attributes:</dt>
  <dd><ul class="no-bullets"><li><a href="#AdditionAttributes">animation addition attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="#AdditiveAttribute"><span>additive</span></a>’</span>, <span class="attr-name">‘<a href="#AccumulateAttribute"><span>accumulate</span></a>’</span></span></span></li><li><a href="#TermAnimationEventAttribute">animation event attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="http://svgwg.org/svg2-draft/interact.html#OnBeginEventAttribute"><span>onbegin</span></a>’</span>, <span class="attr-name">‘<a href="http://svgwg.org/svg2-draft/interact.html#OnEndEventAttribute"><span>onend</span></a>’</span>, <span class="attr-name">‘<a href="http://svgwg.org/svg2-draft/interact.html#OnRepeatEventAttribute"><span>onrepeat</span></a>’</span></span></span></li><li><a href="#TargetElement">animation target element attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="#HrefAttribute"><span>href</span></a>’</span></span></span></li><li><a href="#AttributeNameAttribute">animation attribute target attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="#AttributeNameAttribute"><span>attributeName</span></a>’</span></span></span></li><li><a href="#TimingAttributes">animation timing attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="#BeginAttribute"><span>begin</span></a>’</span>, <span class="attr-name">‘<a href="#DurAttribute"><span>dur</span></a>’</span>, <span class="attr-name">‘<a href="#EndAttribute"><span>end</span></a>’</span>, <span class="attr-name">‘<a href="#MinAttribute"><span>min</span></a>’</span>, <span class="attr-name">‘<a href="#MaxAttribute"><span>max</span></a>’</span>, <span class="attr-name">‘<a href="#RestartAttribute"><span>restart</span></a>’</span>, <span class="attr-name">‘<a href="#RepeatCountAttribute"><span>repeatCount</span></a>’</span>, <span class="attr-name">‘<a href="#RepeatDurAttribute"><span>repeatDur</span></a>’</span>, <span class="attr-name">‘<a href="#FillAttribute"><span>fill</span></a>’</span></span></span></li><li><a href="#ValueAttributes">animation value attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="#CalcModeAttribute"><span>calcMode</span></a>’</span>, <span class="attr-name">‘<a href="#ValuesAttribute"><span>values</span></a>’</span>, <span class="attr-name">‘<a href="#KeyTimesAttribute"><span>keyTimes</span></a>’</span>, <span class="attr-name">‘<a href="#KeySplinesAttribute"><span>keySplines</span></a>’</span>, <span class="attr-name">‘<a href="#FromAttribute"><span>from</span></a>’</span>, <span class="attr-name">‘<a href="#ToAttribute"><span>to</span></a>’</span>, <span class="attr-name">‘<a href="#ByAttribute"><span>by</span></a>’</span></span></span></li><li><a href="https://svgwg.org/svg2-draft/struct.html#TermConditionalProcessingAttribute">conditional processing attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#RequiredExtensionsAttribute"><span>requiredExtensions</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#SystemLanguageAttribute"><span>systemLanguage</span></a>’</span></span></span></li><li><a href="https://svgwg.org/svg2-draft/struct.html#TermCoreAttribute">core attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#IDAttribute"><span>id</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#SVGElementTabindexAttribute"><span>tabindex</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#SVGElementAutofocusAttribute"><span>autofocus</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#LangAttribute"><span>lang</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#XMLSpaceAttribute"><span>xml:space</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/styling.html#ClassAttribute"><span>class</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/styling.html#StyleAttribute"><span>style</span></a>’</span></span></span></li><li><a href="https://html.spec.whatwg.org/multipage/webappapis.html#globaleventhandlers">global event attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oncancel</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oncanplay</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oncanplaythrough</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onchange</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onclick</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onclose</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oncuechange</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondblclick</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondrag</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondragend</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondragenter</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondragexit</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondragleave</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondragover</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondragstart</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondrop</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ondurationchange</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onemptied</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onended</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onerror</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onfocus</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oninput</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oninvalid</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onkeydown</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onkeypress</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onkeyup</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onload</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onloadeddata</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onloadedmetadata</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onloadstart</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onmousedown</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onmouseenter</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onmouseleave</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onmousemove</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onmouseout</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onmouseover</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onmouseup</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onpause</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onplay</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onplaying</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onprogress</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onratechange</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onreset</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onresize</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onscroll</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onseeked</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onseeking</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onselect</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onshow</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onstalled</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onsubmit</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onsuspend</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ontimeupdate</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>ontoggle</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onvolumechange</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onwaiting</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onwheel</span></a>’</span></span></span></li><li><a href="https://html.spec.whatwg.org/multipage/webappapis.html#documentandelementeventhandlers">document element event attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oncopy</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>oncut</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/interact.html#EventAttributes"><span>onpaste</span></a>’</span></span></span></li><li><a href="https://svgwg.org/svg2-draft/styling.html#TermPresentationAttribute">presentation attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — </span></span></li></ul></dd>
  <dt>DOM Interfaces:</dt>
  <dd><ul class="no-bullets"><li><a class="idlinterface" href="#InterfaceSVGAnimateElement">SVGAnimateElement</a></li></ul></dd></dl></div>`,
    res: [
      {
        name: 'animate',
        interface: 'SVGAnimateElement'
      }
    ]
  },

  {
    title: "extracts an SVG element that follows the definition-table pattern",
    spec: "SVG2",
    html: `<table class="definition-table">
    <tbody>
     <tr>
      <th>Name:
      </th><td><dfn class="dfn-paneled" data-dfn-type="element" data-export="" id="elementdef-feblend"><code>feBlend</code></dfn> 
     </td></tr><tr>
      <th>Categories:
      </th><td><a data-link-type="dfn" href="#filter-primitive" id="ref-for-filter-primitive②⑥">filter primitive</a>
     </td></tr><tr>
      <th>Content model:
      </th><td> Any number of <a data-link-type="dfn" href="https://svgwg.org/svg2-draft/struct.html#TermDescriptiveElement" id="ref-for-TermDescriptiveElement">descriptive elements</a>, <a data-link-type="element" href="https://www.w3.org/TR/SVG11/animate.html#AnimateElement" id="ref-for-AnimateElement①">animate</a>, <a data-link-type="element" href="https://svgwg.org/svg2-draft/interact.html#elementdef-script" id="ref-for-elementdef-script①">script</a>, <a data-link-type="element" href="https://www.w3.org/TR/SVG11/animate.html#SetElement" id="ref-for-SetElement①">set</a> elements, in any order. 
     </td></tr><tr>
      <th>Attributes:
      </th><td>
       <ul class="no-bullets">
        <li> <a href="https://www.w3.org/TR/2011/REC-SVG11-20110816/intro.html#TermCoreAttributes">core attributes</a><span class="expanding"> — <a href="https://www.w3.org/TR/2011/REC-SVG11-20110816/struct.html#IDAttribute"><span class="attr-name">id</span></a>, <a href="https://www.w3.org/TR/2011/REC-SVG11-20110816/struct.html#XMLBaseAttribute"><span class="attr-name">xml:base</span></a>, <a href="https://www.w3.org/TR/2011/REC-SVG11-20110816/struct.html#XMLLangAttribute"><span class="attr-name">xml:lang</span></a>, <a href="https://www.w3.org/TR/2011/REC-SVG11-20110816/struct.html#XMLSpaceAttribute"><span class="attr-name">xml:space</span></a></span> 
        </li><li> <a href="http://www.w3.org/TR/2008/REC-SVGTiny12-20081222/intro.html#TermPresentationAttribute">presentation attributes</a><span class="expanding"> — <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/text.html#AlignmentBaselineProperty" id="ref-for-AlignmentBaselineProperty①">alignment-baseline</a>, <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/text.html#BaselineShiftProperty" id="ref-for-BaselineShiftProperty①">baseline-shift</a>, <a class="property" data-link-type="propdesc" href="https://drafts.fxtf.org/css-masking-1/#propdef-clip" id="ref-for-propdef-clip①">clip</a>, <a class="property" data-link-type="propdesc" href="https://drafts.fxtf.org/css-masking-1/#propdef-clip-path" id="ref-for-propdef-clip-path①">clip-path</a>, <a class="property" data-link-type="propdesc" href="https://drafts.fxtf.org/css-masking-1/#propdef-clip-rule" id="ref-for-propdef-clip-rule①">clip-rule</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-color-3/#color0" id="ref-for-color0①">color</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#ColorInterpolationProperty" id="ref-for-ColorInterpolationProperty⑤">color-interpolation</a>, <a class="property" data-link-type="propdesc" href="#propdef-color-interpolation-filters" id="ref-for-propdef-color-interpolation-filters⑦">color-interpolation-filters</a>, <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/painting.html#ColorRenderingProperty" id="ref-for-ColorRenderingProperty①">color-rendering</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-ui-4/#propdef-cursor" id="ref-for-propdef-cursor①">cursor</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-writing-modes-3/#propdef-direction" id="ref-for-propdef-direction①">direction</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-display-3/#propdef-display" id="ref-for-propdef-display④">display</a>, <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/text.html#DominantBaselineProperty" id="ref-for-DominantBaselineProperty①">dominant-baseline</a>, <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/filters.html#EnableBackgroundProperty" id="ref-for-EnableBackgroundProperty①">enable-background</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#FillProperty" id="ref-for-FillProperty③">fill</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#FillOpacityProperty" id="ref-for-FillOpacityProperty①">fill-opacity</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#FillRuleProperty" id="ref-for-FillRuleProperty①">fill-rule</a>, <a class="property" data-link-type="propdesc" href="#propdef-filter" id="ref-for-propdef-filter①②">filter</a>, <a class="property" data-link-type="propdesc" href="#propdef-flood-color" id="ref-for-propdef-flood-color②">flood-color</a>, <a class="property" data-link-type="propdesc" href="#propdef-flood-opacity" id="ref-for-propdef-flood-opacity③">flood-opacity</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-3/#propdef-font" id="ref-for-propdef-font①">font</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-3/#propdef-font-family" id="ref-for-propdef-font-family①">font-family</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-3/#propdef-font-size" id="ref-for-propdef-font-size①">font-size</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-4/#propdef-font-size-adjust" id="ref-for-propdef-font-size-adjust①">font-size-adjust</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-3/#propdef-font-stretch" id="ref-for-propdef-font-stretch①">font-stretch</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-3/#propdef-font-style" id="ref-for-propdef-font-style①">font-style</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-3/#propdef-font-variant" id="ref-for-propdef-font-variant①">font-variant</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-fonts-3/#propdef-font-weight" id="ref-for-propdef-font-weight①">font-weight</a>, <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/text.html#GlyphOrientationHorizontalProperty" id="ref-for-GlyphOrientationHorizontalProperty①">glyph-orientation-horizontal</a>, <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/text.html#GlyphOrientationVerticalProperty" id="ref-for-GlyphOrientationVerticalProperty①">glyph-orientation-vertical</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-images-3/#propdef-image-rendering" id="ref-for-propdef-image-rendering①">image-rendering</a>, <a class="property" data-link-type="propdesc" href="https://drafts.fxtf.org/compositing-2/#propdef-isolation" id="ref-for-propdef-isolation③">isolation</a>, <a class="property" data-link-type="propdesc" href="https://www.w3.org/TR/SVG11/text.html#KerningProperty" id="ref-for-KerningProperty①">kerning</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-text-3/#propdef-letter-spacing" id="ref-for-propdef-letter-spacing①">letter-spacing</a>, <a class="property" data-link-type="propdesc" href="#propdef-lighting-color" id="ref-for-propdef-lighting-color②">lighting-color</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#MarkerProperty" id="ref-for-MarkerProperty①">marker</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#MarkerEndProperty" id="ref-for-MarkerEndProperty①">marker-end</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#MarkerMidProperty" id="ref-for-MarkerMidProperty①">marker-mid</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#MarkerStartProperty" id="ref-for-MarkerStartProperty①">marker-start</a>, <a class="property" data-link-type="propdesc" href="https://drafts.fxtf.org/css-masking-1/#propdef-mask" id="ref-for-propdef-mask①">mask</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-color-4/#propdef-opacity" id="ref-for-propdef-opacity④">opacity</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-overflow-3/#propdef-overflow" id="ref-for-propdef-overflow①">overflow</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/interact.html#PointerEventsProperty" id="ref-for-PointerEventsProperty①">pointer-events</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#ShapeRenderingProperty" id="ref-for-ShapeRenderingProperty①">shape-rendering</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/pservers.html#StopColorProperty" id="ref-for-StopColorProperty①">stop-color</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/pservers.html#StopOpacityProperty" id="ref-for-StopOpacityProperty①">stop-opacity</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeProperty" id="ref-for-StrokeProperty②">stroke</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeDasharrayProperty" id="ref-for-StrokeDasharrayProperty①">stroke-dasharray</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeDashoffsetProperty" id="ref-for-StrokeDashoffsetProperty①">stroke-dashoffset</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeLinecapProperty" id="ref-for-StrokeLinecapProperty①">stroke-linecap</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeLinejoinProperty" id="ref-for-StrokeLinejoinProperty①">stroke-linejoin</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeMiterlimitProperty" id="ref-for-StrokeMiterlimitProperty①">stroke-miterlimit</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeOpacityProperty" id="ref-for-StrokeOpacityProperty①">stroke-opacity</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#StrokeWidthProperty" id="ref-for-StrokeWidthProperty①">stroke-width</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/text.html#TextAnchorProperty" id="ref-for-TextAnchorProperty①">text-anchor</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-text-decor-4/#propdef-text-decoration" id="ref-for-propdef-text-decoration①">text-decoration</a>, <a class="property" data-link-type="propdesc" href="https://svgwg.org/svg2-draft/painting.html#TextRenderingProperty" id="ref-for-TextRenderingProperty①">text-rendering</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-writing-modes-3/#propdef-unicode-bidi" id="ref-for-propdef-unicode-bidi①">unicode-bidi</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css2/#propdef-visibility" id="ref-for-propdef-visibility①">visibility</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-text-3/#propdef-word-spacing" id="ref-for-propdef-word-spacing①">word-spacing</a>, <a class="property" data-link-type="propdesc" href="https://drafts.csswg.org/css-writing-modes-4/#propdef-writing-mode" id="ref-for-propdef-writing-mode①">writing-mode</a></span> 
        </li><li> <a href="#filter-primitive-attributes" id="ref-for-filter-primitive-attributes">filter primitive attributes</a> <span class="expanding"> —<wbr><a data-link-type="element-attr" href="#element-attrdef-filter-primitive-x" id="ref-for-element-attrdef-filter-primitive-x④">x</a>, <a data-link-type="element-attr" href="#element-attrdef-filter-primitive-y" id="ref-for-element-attrdef-filter-primitive-y④">y</a>, <a data-link-type="element-attr" href="#element-attrdef-filter-primitive-width" id="ref-for-element-attrdef-filter-primitive-width④">width</a>, <a data-link-type="element-attr" href="#element-attrdef-filter-primitive-height" id="ref-for-element-attrdef-filter-primitive-height④">height</a>, <a data-link-type="element-attr" href="#element-attrdef-filter-primitive-result" id="ref-for-element-attrdef-filter-primitive-result④">result</a> </span> 
        </li><li> <a href="https://www.w3.org/TR/2011/REC-SVG11-20110816/styling.html#ClassAttribute"><span class="attr-name">class</span></a> 
        </li><li> <a href="https://www.w3.org/TR/2011/REC-SVG11-20110816/styling.html#StyleAttribute"><span class="attr-name">style</span></a> 
        </li><li> <a data-link-type="element-attr" href="#element-attrdef-filter-primitive-in" id="ref-for-element-attrdef-filter-primitive-in③">in</a> 
        </li><li> <a data-link-type="element-attr" href="#element-attrdef-feblend-in2" id="ref-for-element-attrdef-feblend-in2">in2</a> 
        </li><li><a data-link-type="element-attr" href="#element-attrdef-feblend-mode" id="ref-for-element-attrdef-feblend-mode">mode</a>
       </li></ul>
     </td></tr><tr>
      <th>DOM Interfaces:
      </th><td><a class="idlinterface" href="#InterfaceSVGFEBlendElement">SVGFEBlendElement</a>
   </td></tr></tbody></table>`,
    res: [
      {
        name: 'feBlend',
        interface: 'SVGFEBlendElement'
      }
    ]
  },

  {
    title: "does not return an interface when none is defined",
    spec: "SVG2",
    html: `<div class="element-summary"><div class="element-summary-name"><span class="element-name">‘<dfn data-dfn-type="element" data-export="" id="elementdef-discard">discard</dfn>’</span></div>
<dl>
<dt>Categories:</dt>
<dd><a href="#TermAnimationElement">Animation element</a></dd>
<dt>Content model:</dt>
<dd>Any number of the following elements, in any order:<ul class="no-bullets"><li><a href="https://svgwg.org/svg2-draft/struct.html#TermDescriptiveElement">descriptive elements</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="element-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#DescElement"><span>desc</span></a>’</span>, <span class="element-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#TitleElement"><span>title</span></a>’</span>, <span class="element-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#MetadataElement"><span>metadata</span></a>’</span></span></span></li></ul><span class="element-name"><a href="https://svgwg.org/svg2-draft/interact.html#ScriptElement"><span>script</span></a></span></dd>
<dt>Attributes:</dt>
<dd><ul class="no-bullets"><li><a href="https://svgwg.org/svg2-draft/struct.html#TermConditionalProcessingAttribute">conditional processing attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#RequiredExtensionsAttribute"><span>requiredExtensions</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#SystemLanguageAttribute"><span>systemLanguage</span></a>’</span></span></span></li><li><a href="https://svgwg.org/svg2-draft/struct.html#TermCoreAttribute">core attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#IDAttribute"><span>id</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#SVGElementTabindexAttribute"><span>tabindex</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#SVGElementAutofocusAttribute"><span>autofocus</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#LangAttribute"><span>lang</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#XMLSpaceAttribute"><span>xml:space</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/styling.html#ClassAttribute"><span>class</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/styling.html#StyleAttribute"><span>style</span></a>’</span></span></span></li><li><a href="https://svgwg.org/svg2-draft/struct.html#TermARIAAttribute">aria attributes</a><span class="expanding"><span> <span class="expander" onclick="expand(event.target)"></span></span><span style="display: none;"> — <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-activedescendant"><span>aria-activedescendant</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-atomic"><span>aria-atomic</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-autocomplete"><span>aria-autocomplete</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-busy"><span>aria-busy</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-checked"><span>aria-checked</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-colcount"><span>aria-colcount</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-colindex"><span>aria-colindex</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-colspan"><span>aria-colspan</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-controls"><span>aria-controls</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-current"><span>aria-current</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-describedby"><span>aria-describedby</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-details"><span>aria-details</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-disabled"><span>aria-disabled</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-dropeffect"><span>aria-dropeffect</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-errormessage"><span>aria-errormessage</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-expanded"><span>aria-expanded</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-flowto"><span>aria-flowto</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-grabbed"><span>aria-grabbed</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-haspopup"><span>aria-haspopup</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-hidden"><span>aria-hidden</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-invalid"><span>aria-invalid</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-keyshortcuts"><span>aria-keyshortcuts</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-label"><span>aria-label</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-labelledby"><span>aria-labelledby</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-level"><span>aria-level</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-live"><span>aria-live</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-modal"><span>aria-modal</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-multiline"><span>aria-multiline</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-multiselectable"><span>aria-multiselectable</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-orientation"><span>aria-orientation</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-owns"><span>aria-owns</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-placeholder"><span>aria-placeholder</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-posinset"><span>aria-posinset</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-pressed"><span>aria-pressed</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-readonly"><span>aria-readonly</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-relevant"><span>aria-relevant</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-required"><span>aria-required</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-roledescription"><span>aria-roledescription</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-rowcount"><span>aria-rowcount</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-rowindex"><span>aria-rowindex</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-rowspan"><span>aria-rowspan</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-selected"><span>aria-selected</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-setsize"><span>aria-setsize</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-sort"><span>aria-sort</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-valuemax"><span>aria-valuemax</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-valuemin"><span>aria-valuemin</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-valuenow"><span>aria-valuenow</span></a>’</span>, <span class="attr-name">‘<a href="https://www.w3.org/TR/wai-aria-1.1/#aria-valuetext"><span>aria-valuetext</span></a>’</span>, <span class="attr-name">‘<a href="https://svgwg.org/svg2-draft/struct.html#RoleAttribute"><span>role</span></a>’</span></span></span></li><li><span class="attr-name">‘<a href="#DiscardElementBeginAttribute"><span>begin</span></a>’</span></li><li><span class="attr-name">‘<a href="#DiscardElementHrefAttribute"><span>href</span></a>’</span></li></ul></dd>
<dt>DOM Interfaces:</dt>
<dd><ul class="no-bullets"></ul></dd>
</dl></div>`,
    res: [
      {
        name: 'discard'
      }
    ]
  },

  {
    title: "extracts a MathMLElement",
    spec: "mathml-core",
    html: `<p>
      The <dfn data-dfn-type="element">mmm</dfn> element is a MathML element.
    </p>`,
    res: [
      {
        name: "mmm",
        interface: "MathMLElement"
      }
    ]
  },

  {
    title: "links an element with its interface in simple case",
    spec: "portals",
    html: `<p>
      The <dfn data-dfn-type="element">portal</dfn> element uses the
      <dfn data-dfn-type="interface">HTMLPortalElement</dfn> interface.
    </p>`,
    res: [
      {
        name: "portal",
        interface: "HTMLPortalElement"
      }
    ]
  }
];


describe("Markup element extraction", function () {
  this.slow(5000);

  let browser;
  let extractElementsCode;
  const validateSchema = getSchemaValidationFunction('extract-elements');

  before(async () => {
    const bundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-elements.mjs'),
      onwarn: _ => {}
    });
    const output = (await bundle.generate({
      name: 'extractElements',
      format: 'iife'
    })).output;
    extractElementsCode = output[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  tests.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      page.setContent(t.html + "<script>let spec = '" + t.spec + "';</script>");
      await page.addScriptTag({ content: extractElementsCode });

      const extractedElements = await page.evaluate(async () => {
        return extractElements(spec);
      });
      await page.close();
      assert.deepEqual(extractedElements, t.res);

      const errors = validateSchema(extractedElements);
      assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
    });
  });

  after(async () => {
    await browser.close();
  });
});
