import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { rollup } from 'rollup';
import { getSchemaValidationFunction } from '../src/lib/util.js';
const scriptPath = path.dirname(fileURLToPath(import.meta.url));

// Associating HTML definitions with the right data relies on IDL defined in that spec
const baseHtml = `<pre><code class=idl>
interface ApplicationCache{};
interface AudioTrackList {};
interface VideoTrackList {};
interface TextTrackList {};
interface mixin DocumentAndElementEventHandlers {
  attribute EventHandler oncopy;
};
interface BroadcastChannel {
  constructor(DOMString name);
};
[LegacyFactoryFunction=Audio(optional DOMString src)]
interface HTMLAudioElement {
};
interface mixin WindowOrWorkerGlobalScope {
  DOMString btoa(DOMString data);
};
interface Window {
   readonly attribute Navigator navigator;
};
interface CustomElementRegistry {
  Promise&lt;void> whenDefined(DOMString name);
};
interface HTMLMediaElement : HTMLElement {
  CanPlayTypeResult canPlayType(DOMString type);
};
interface Navigator {
};
Navigator includes NavigatorID;
interface mixin NavigatorID {
};
partial interface mixin NavigatorID {
  [Exposed=Window] boolean taintEnabled();
};
enum CanPlayTypeResult { ""};
</code></pre>`;

const baseSVG2 = `
<!-- we use the IDL declarations to find the type of attribute vs methods -->
<pre class=idl>
interface SVGNameList {

  readonly attribute unsigned long length;
  readonly attribute unsigned long numberOfItems;

  void clear();
  Type initialize(Type newItem);
};
[Exposed=Window]
interface SVGAnimatedLengthList {
};
</pre>
<!-- we use the attindex page to associate attributes to elements -->
<div data-reffy-page='https://example.org/attindex.html'>
<table>
<tr><th><span class="attr-name"><a href="struct.html#RequiredExtensionsAttribute"><span>requiredExtensions</span></a></span></th><td><span class="element-name"><a href="linking.html#AElement"><span>a</span></a></span>, <span class="element-name"><a href="https://svgwg.org/specs/animations/#AnimateElement"><span>animate</span></a></span>, <span class="element-name"><a href="https://svgwg.org/specs/animations/#AnimateMotionElement"><span>animateMotion</span></a></span>, <span class="element-name"><a href="https://svgwg.org/specs/animations/#AnimateTransformElement"><span>animateTransform</span></a></span>, <span class="element-name"><a href="embedded.html#HTMLElements"><span>audio</span></a></span>, <span class="element-name"><a href="embedded.html#HTMLElements"><span>canvas</span></a></span>, <span class="element-name"><a href="shapes.html#CircleElement"><span>circle</span></a></span>, <span class="element-name"><a href="https://drafts.fxtf.org/css-masking-1/#ClipPathElement"><span>clipPath</span></a></span>, <span class="element-name"><a href="https://svgwg.org/specs/animations/#DiscardElement"><span>discard</span></a></span>, <span class="element-name"><a href="shapes.html#EllipseElement"><span>ellipse</span></a></span>, <span class="element-name"><a href="embedded.html#ForeignObjectElement"><span>foreignObject</span></a></span>, <span class="element-name"><a href="struct.html#GElement"><span>g</span></a></span>, <span class="element-name"><a href="embedded.html#HTMLElements"><span>iframe</span></a></span>, <span class="element-name"><a href="embedded.html#ImageElement"><span>image</span></a></span>, <span class="element-name"><a href="shapes.html#LineElement"><span>line</span></a></span>, <span class="element-name"><a href="https://drafts.fxtf.org/css-masking-1/#MaskElement"><span>mask</span></a></span>, <span class="element-name"><a href="paths.html#PathElement"><span>path</span></a></span>, <span class="element-name"><a href="shapes.html#PolygonElement"><span>polygon</span></a></span>, <span class="element-name"><a href="shapes.html#PolylineElement"><span>polyline</span></a></span>, <span class="element-name"><a href="shapes.html#RectElement"><span>rect</span></a></span>, <span class="element-name"><a href="https://svgwg.org/specs/animations/#SetElement"><span>set</span></a></span>, <span class="element-name"><a href="struct.html#SVGElement"><span>svg</span></a></span>, <span class="element-name"><a href="struct.html#SwitchElement"><span>switch</span></a></span>, <span class="element-name"><a href="text.html#TextElement"><span>text</span></a></span>, <span class="element-name"><a href="text.html#TextPathElement"><span>textPath</span></a></span>, <span class="element-name"><a href="text.html#TextElement"><span>tspan</span></a></span>, <span class="element-name"><a href="struct.html#UnknownElement"><span>unknown</span></a></span>, <span class="element-name"><a href="struct.html#UseElement"><span>use</span></a></span>, <span class="element-name"><a href="embedded.html#HTMLElements"><span>video</span></a></span></td><td></td></tr>
<tr><th><span class="attr-name"><a href="pservers.html#PatternElementPatternUnitsAttribute"><span>patternUnits</span></a></span></th><td><span class="element-name"><a href="pservers.html#PatternElement"><span>pattern</span></a></span></td><td>✓</td></tr>
</table></div>
<!-- We use the property index to associate properties with elements -->
<div data-reffy-page='https://example.org/propidx.html'>
<table>
<tr>
          <th><a class="property" href="pservers.html#StopOpacityProperty">stop-opacity</a></th>
          <td>&lt;‘<a class="property" href="render.html#ObjectAndGroupOpacityProperties">opacity</a>’&gt;</td>
          <td>1</td>
          <td><span class="element-name">‘<a href="pservers.html#StopElement"><span>stop</span></a>’</span> elements</td>
          <td>no</td>
          <td>N/A</td>
          <td><a href="https://www.w3.org/TR/2008/REC-CSS2-20080411/media.html#visual-media-group">visual</a></td>
          <td>by computed value</td>
          <td>the specified value converted to a number, clamped to the range [0,1]</td>
        </tr>
</table></div>
`;

const baseDfn = {
    id: 'foo',
    linkingText: [ 'Foo' ],
    localLinkingText: [],
    type: 'dfn',
    for: [],
    access: 'private',
    informative: false,
    definedIn: 'prose',
    heading: {
      href: 'about:blank',
      title: ''
    }
};
const tests = [
  {title: "parses a simple <dfn>",
   html: "<dfn id='foo' data-dfn-type='dfn'>Foo</dfn>",
   changesToBaseDfn: [{}]
  },
  {title: "normalizes whitespace and trims text in a simple <dfn>",
   html: "<dfn id='foo' data-dfn-type='dfn'>Foo\n    \n</dfn>",
   changesToBaseDfn: [{}]
  },

  {title: "encodes the href fragment",
   html: "<dfn id='foo-%' data-dfn-type='dfn'>Foo</dfn>",
   changesToBaseDfn: [{id: 'foo-%', href: 'about:blank#foo-%25'}]
  },

  {title: "ignores a <dfn> without an id",
   html: "<dfn data-dfn-type='dfn'>Foo</dfn>",
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
   html: "<div class=informative><dfn id=foo data-dfn-type='dfn'>Foo</dfn></div>",
   changesToBaseDfn: [{informative: true}]
  },
  {title: "associates a definition to a namespace",
   html: "<dfn data-dfn-for='Bar,Baz' id=foo>Foo</dfn>",
   changesToBaseDfn: [{for:['Bar', 'Baz']}]
  },
  {title: "considers definitions in headings",
   html: "<h2 data-dfn-type=dfn id=foo>Foo</h2>",
   changesToBaseDfn: [{heading: { id: "foo", href: "about:blank#foo", title: "Foo"}, definedIn: "heading"}]
  },
  {title: "ignores elements that aren't <dfn> and headings",
   html: "<span data-dfn-type=dfn id=foo>Foo</span>",
   changesToBaseDfn: []
  },
  {title: "ignores headings without a data-dfn-type",
   html: "<h2 id=foo>Foo</h2>",
   changesToBaseDfn: []
  },
  {title: "uses text in data-lt as linking text",
   html: "<dfn data-lt='foo \n   |\nbar' id=foo data-dfn-type='dfn'>Foo</dfn>",
   changesToBaseDfn: [{linkingText: ["foo", "bar"]}]
  },
  {title: "includes data-lt in its list of linking text",
   html: "<dfn data-lt='foo \n   |\nbar' id=foo data-dfn-type='dfn'>Foo</dfn>",
   changesToBaseDfn: [{linkingText: ["foo", "bar"]}]
  },
  {title: "ignores dfns with an invalid data-dfn-type",
   html: "<dfn id=foo data-dfn-type=invalidtype>Foo</dfn>",
   changesToBaseDfn: []
  },
  {title: "ignores dfns in a <del>",
   html: "<del><dfn id=foo>Foo</dfn></del>",
   changesToBaseDfn: []
  },
  {title: "ignores dfns already exported",
   html: "<dfn id='foo' data-dfn-type='dfn' data-export>Foo</dfn>. <dfn id='foo2' data-export>Foo</dfn> is already exported.",
   changesToBaseDfn: [{ access: "public" }]
  },
  {title: "automatically fixes internal slots dfns with an invalid 'idl' data-dfn-type",
   html: "<dfn id=foo data-dfn-type=idl>Foo</dfn>",
   changesToBaseDfn: [{type: "attribute", access: "public"}]
  },
  {title: "automatically fixes internal methods with an invalid 'idl' data-dfn-type",
   html: "<dfn id=foo data-dfn-type=idl>Foo()</dfn>",
   changesToBaseDfn: [{ linkingText: [ 'Foo()' ], type: "method", access: "public"}]
  },
  {
    title: "extracts definitions of namespace objects in ecmascript spec",
    html: '<emu-clause id="sec-foo-object"><h1>The Foo Object</h1></emu-clause>',
    changesToBaseDfn: [{type: "namespace", access: "public", definedIn: "heading", id: "sec-foo-object", heading: { id: "sec-foo-object", href: "about:blank#sec-foo-object", title: "The Foo Object"}}],
    spec: "ecmascript"
  },
  {
    title: "extracts definitions of interface objects in ecmascript spec",
    html: '<emu-clause id="sec-foo-object"><h1>The Foo Object</h1><emu-clause id="sec-foo-constructor"><h1>The Foo Constructor</h1></emu-clause></emu-clause>',
    changesToBaseDfn: [{type: "interface", access: "public", definedIn: "heading", id: "sec-foo-object", heading: { id: "sec-foo-object", href: "about:blank#sec-foo-object", title: "The Foo Object"}}],
    spec: "ecmascript"
  },
  {
    title: "extracts definitions of ES-level objects in ecmascript spec that don't follow the regular id heuristic",
    html: '<emu-clause id="sec-regexp-regular-expression-objects"><h1>The RegExp (Regular Expression) Object</h1><emu-clause id="sec-regexp-constructor"><h1>RegExp Constructor</h1></emu-clause></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "RegExp"], type: "interface", access: "public", definedIn: "heading", id: "sec-regexp-regular-expression-objects", heading: { id: "sec-regexp-regular-expression-objects", href: "about:blank#sec-regexp-regular-expression-objects", title: "The RegExp (Regular Expression) Object"}}],
    spec: "ecmascript"
  },
  {
    title: "extracts definitions of exceptions objects in ecmascript spec",
    html: '<emu-clause id="sec-fooerror-object"><h1>The FooError Object</h1><emu-clause id="sec-fooerror-constructor"><h1>The FooError Constructor</h1></emu-clause></emu-clause>',
    changesToBaseDfn: [{linkingText: ["FooError"], type: "exception", access: "public", definedIn: "heading", id: "sec-fooerror-object", heading: { id: "sec-fooerror-object", href: "about:blank#sec-fooerror-object", title: "The FooError Object"}}],
    spec: "ecmascript"
  },
  {
    title: "extracts prototype-level methods of objects in ecmascript spec",
    html: '<emu-clause id="sec-array.prototype.concat"><h1><span class="secnum">23.1.3.1</span> Array.prototype.concat ( ...<var>items</var> )</h1></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "concat(...items)"], type: "method", "for": ["Array"], access: "public", definedIn: "heading", id: "sec-array.prototype.concat", heading: { number: "23.1.3.1", id: "sec-array.prototype.concat", href: "about:blank#sec-array.prototype.concat", title: "Array.prototype.concat ( ...items )"}}],
    spec: "ecmascript"
  },
  {
    title: "extracts prototype-level properties of objects in ecmascript spec",
    html: '<emu-clause id="sec-get-arraybuffer.prototype.bytelength"><h1><span class="secnum">25.1.5.1</span> get ArrayBuffer.prototype.byteLength</h1></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "byteLength"], type: "attribute", "for": ["ArrayBuffer"], access: "public", definedIn: "heading", id: "sec-get-arraybuffer.prototype.bytelength", heading: { number: "25.1.5.1", id: "sec-get-arraybuffer.prototype.bytelength", href: "about:blank#sec-get-arraybuffer.prototype.bytelength", title: "get ArrayBuffer.prototype.byteLength"}}],
    spec: "ecmascript"
  },
  {
    title: "extracts  properties of the globalThis object in ecmascript spec",
    html: '<emu-clause id="sec-value-properties-of-the-global-object"><h1><span class="secnum">25.1.5.1</span> Value Properties of the Global Object</h1><emu-clause id="foo"> <h1>Foo</h1></emu-clause></emu-clause>',
    changesToBaseDfn: [ {type: "attribute", "for": ["globalThis"], access: "public", definedIn: "heading", heading: { id: "foo", href: "about:blank#foo", title: "Foo"}}],
    spec: "ecmascript"
  },
  {
    title: 'extracts instance-level methods from objects in ecmascript spec',
    html: '<emu-clause id="sec-json.parse"><h1><span class="secnum">25.5.1</span> JSON.parse ( <var>text</var> [ , <var>reviver</var> ] )</h1></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "parse(text, reviver)"], type: "method", "for": ["JSON"], access: "public", definedIn: "heading", id: "sec-json.parse", heading: { number: "25.5.1", id: "sec-json.parse", href: "about:blank#sec-json.parse", title: "JSON.parse ( text [ , reviver ] )"}}],
    spec: "ecmascript"
  },
  {
    title: 'extracts instance-level constants from objects in ecmascript spec',
    html: '<emu-clause id="sec-number.epsilon"><h1><span class="secnum">20.1.2.19</span> Number.EPSILON</h1></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "EPSILON"], type: "const", "for": ["Number"], access: "public", definedIn: "heading", id: "sec-number.epsilon", heading: { number: "20.1.2.19", id: "sec-number.epsilon", href: "about:blank#sec-number.epsilon", title: "Number.EPSILON"}}],
    spec: "ecmascript"
  },
  {
    title: 'extracts constructors from ecmascript spec',
    // This requires also defining the associated interface
    html: '<emu-clause id="sec-object-object"><h1>The Object Object</h1><emu-clause id="sec-object-constructor"><h1>Object ( [ value ] )</h1></emu-clause></emu-clause>',
    changesToBaseDfn: [
      {linkingText: [ "Object"], type: "interface", access: "public", definedIn: "heading", id: "sec-object-object", heading: { id: "sec-object-object", href: "about:blank#sec-object-object", title: "The Object Object"}},
      {linkingText: [ "Object(value)"], type: "constructor", "for": ["Object"], access: "public", definedIn: "heading", id: "sec-object-constructor", heading: { id: "sec-object-constructor", href: "about:blank#sec-object-constructor", title: "Object ( [ value ] )"}}
    ],
    spec: "ecmascript"
  },
  {
    title: 'extracts abstract operations from ecmascript spec',
    html: '<emu-clause id="sec-toprimitive" oldids="table-9" aoid="ToPrimitive"><span id="table-9"></span><h1><span class="secnum">7.1.1</span> ToPrimitive ( <var>input</var> [ , <var>preferredType</var> ] )</h1>',
    changesToBaseDfn: [{linkingText: [ "ToPrimitive", "ToPrimitive(input, preferredType)"], type: "abstract-op", access: "public", definedIn: "heading", id: "sec-toprimitive", heading: { number: "7.1.1", id: "sec-toprimitive", href: "about:blank#sec-toprimitive", title: "ToPrimitive ( input [ , preferredType ] )"}}],
    spec: "ecmascript"
  },
  {
    title: 'extracts abstract operations with digits in their name from ecmascript spec',
    html: '<emu-clause id="sec-toint32" aoid="ToInt32"><h1><span class="secnum">7.1.6</span> ToInt32 ( <var>argument</var> )</h1>',
    changesToBaseDfn: [{linkingText: [ "ToInt32", "ToInt32(argument)"], type: "abstract-op", access: "public", definedIn: "heading", id: "sec-toint32", heading: { number: "7.1.6", id: "sec-toint32", href: "about:blank#sec-toint32", title: "ToInt32 ( argument )"}}],
    spec: "ecmascript"
  },
  {
    title: 'extracts abstract methods (scoped abstract ops) from ecmascript spec',
    html: '<emu-clause id="bar"><h1>Heading</h1><figure><figcaption>Abstract Methods for <emu-xref>Scope</emu-xref></figcaption><table><tbody><tr><td>AbstractMethod ()</td></tr></tbody></table></figure></emu-clause><emu-clause id="foo"><h1>AbstractMethod(param)</h1></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "AbstractMethod(param)"], type: "abstract-op", "for": ["Scope"], access: "public", definedIn: "heading", heading: { id: "foo", href: "about:blank#foo", title: "AbstractMethod(param)"}}],
    spec: "ecmascript"
  },
  {
    title: 'extracts abstract methods in hierarchy of classes from ecmascript spec',
    html: `<emu-clause id="bar">
      <h1>Heading</h1>
      <figure>
        <figcaption>Abstract Methods for <emu-xref>Scope</emu-xref></figcaption>
        <table><tbody><tr><td>AbstractMethod ()</td></tr></tbody></table>
      </figure>
    </emu-clause>
    <emu-clause id="ab">
      <h1>Scope</h1>
      <emu-clause id="concrete">
        <h1>Concrete Scope</h1>
        <emu-clause id="foo">
          <h1>AbstractMethod(param)</h1>
        </emu-clause>
      </emu-clause>
    </emu-clause>`,
    changesToBaseDfn: [{linkingText: [ "AbstractMethod(param)"], type: "abstract-op", "for": ["Concrete Scope"], access: "public", definedIn: "heading", heading: { id: "foo", href: "about:blank#foo", title: "AbstractMethod(param)"}}],
    spec: "ecmascript"
  },
  {
    title: 'extracts abstract operations marked as <emu-eqn> from ecmascript spec',
    html: '<emu-clause id="id"><h1>heading</h1><emu-eqn aoid="Foo" id="foo">foo</emu-eqn> is an abstract-op, but <emu-eqn aoid="bar">bar = 25*12</emu-eqn> is not</emu-clause>',
    changesToBaseDfn: [{ type: "abstract-op", access: "public", heading: { id: "id", href:"about:blank#id", title: "heading"} }],
    spec: "ecmascript"
  },
  {
    title: 'extracts state components from ecmascript spec',
    html: '<emu-clause id="foo"><h1>Heading</h1><figure><figcaption>State Components for ECMAScript Execution Contexts</figcaption><table><tbody><tr><td>Function</td></tr></tbody></table></figure></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "Function"], type: "dfn", "for": ["ECMAScript Execution Contexts"], access: "public", definedIn: "table", heading: { id: "foo", href: "about:blank#foo", title: "Heading"}}],
    spec: "ecmascript"
  },
  {
    title: 'assign ids to un-id’d definitions of the ecmascript spec',
    html: '<emu-clause id="foo"><h1><span class="secnum">9.4</span> Execution Contexts</h1><p>An <dfn variants="execution contexts">execution context</dfn> is a specification device that is used to track the runtime evaluation of code by an ECMAScript implementation.</p></emu-clause>',
    changesToBaseDfn: [{linkingText: [ "execution context", "execution contexts"], "for": ["ECMAScript"], access: "public", definedIn: "prose", heading: { number: "9.4", id: "foo", href: "about:blank#foo", title: "Execution Contexts"}}],
    spec: "ecmascript"
  },
  {
    title: "ignores definition in conformance page of ecmascript spec",
    html: '<section data-reffy-page="https://example.org/conformance.html"><dfn>Bar</dfn></section>',
    changesToBaseDfn: [],
    spec: "ecmascript"
  },
  {title: "handles HTML spec conventions of definitions in headings",
   html: '<h6 id="parsing-main-inselect"><span class="secno">12.2.6.4.16</span> The "<dfn data-noexport>in select</dfn>" insertion mode<a href="#parsing-main-inselect" class="self-link"></a></h6>',
   changesToBaseDfn: [{id: "parsing-main-inselect",
           linkingText: ["in select"],
           heading: { id: "parsing-main-inselect", href: "about:blank#parsing-main-inselect", title: "The \"in select\" insertion mode", number: "12.2.6.4.16"},
           definedIn: "heading"}],
   spec: "html"
  },
  {title: "handles HTML spec conventions of definitions in headings (with extra attributes)",
   html: '<h4 id="transferable-objects" data-lt="transferable object" data-export=""><span class="secno">2.7.2</span> <dfn>Transferable objects</dfn><a href="#transferable-objects" class="self-link"></a></h4>',
   changesToBaseDfn: [{id: "transferable-objects",
           linkingText: ["transferable object"],
           access: "public",
           heading: { id: "transferable-objects", href: "about:blank#transferable-objects", title: "Transferable objects", number: "2.7.2"},
           definedIn: "heading"}],
   spec: "html"
  },
  {
    "title": "ignores definitions imported in the HTML spec from other specs",
    html: '<li>The <dfn id="xmlhttprequest"><a href="https://xhr.spec.whatwg.org/#xmlhttprequest"><code>XMLHttpRequest</code></a></dfn> interface</li>',
    changesToBaseDfn: [],
    spec: "html"
  },
  {
    title: "ignores definitions imported in the Source map format spec",
    html: '<li>The <a href="https://infra.spec.whatwg.org/#byte-sequence"><dfn id="external-whatwg-infra-byte-sequence">byte sequence</dfn></a>',
    changesToBaseDfn: [],
    spec: "sourcemap"
  },
  {
    "title": "extracts attribute definition from the SVG2 spec",
    html: `<table class="attrdef def"><tr>
        <td><dfn id="RequiredExtensionsAttribute">requiredExtensions</dfn></td>
        <td><a href="https://html.spec.whatwg.org/multipage/common-microsyntaxes.html#set-of-space-separated-tokens">set of space-separated tokens</a> <span class="syntax">[HTML]</span></td>
        <td>(none)</td>
        <td>no</td>
      </tr></table>`,
    changesToBaseDfn: [{
      id: "RequiredExtensionsAttribute",
      linkingText: ["requiredExtensions"],
      type: "element-attr",
      for: ["a",
            "animate",
            "animateMotion",
            "animateTransform",
            "audio",
            "canvas",
            "circle",
            "clipPath",
            "discard",
            "ellipse",
            "foreignObject",
            "g",
            "iframe",
            "image",
            "line",
            "mask",
            "path",
            "polygon",
            "polyline",
            "rect",
            "set",
            "svg",
            "switch",
            "text",
            "textPath",
            "tspan",
            "unknown",
            "use",
            "video"
           ],
      "access": "public",
      definedIn: "table"
    }],
    spec: "SVG2"
  },
  {
    title: "identifies the link element definition in SVG2 spec",
    html: `<h2 id="LinkElement" class="heading">6.3. External style sheets: the effect of the HTML <span class="element-name">‘link’</span> element<a class="self-link" href="#LinkElement"></a></h2>`,
    changesToBaseDfn: [{
      id: "LinkElement",
      linkingText: ["link"],
      type: "element",
      access: "public",
      heading: { id: "LinkElement", href: "about:blank#LinkElement", title: "External style sheets: the effect of the HTML ‘link’ element", number: "6.3"},
      definedIn: "heading"
    }],
    spec: "SVG2"
  },
  {
    title: "identifies attributes defined with class adef in SVG2 spec",
    html: `<dt id="PatternElementPatternUnitsAttribute"><span class="adef">patternUnits</span></dt>`,
    changesToBaseDfn: [{
      id: "PatternElementPatternUnitsAttribute",
      linkingText: ["patternUnits"],
      type: "element-attr",
      for: ["pattern"],
      access: "public",
      definedIn: "dt"
    }],
    spec: "SVG2"
  },
  {
    title: "identifies properties defined with class propdef in SVG2 spec",
    html: `<dt id="StopOpacityProperty">‘<span class="propdef-title property">stop-opacity</span>’</dt>`,
    changesToBaseDfn: [{
      id: "StopOpacityProperty",
      linkingText: ["stop-opacity"],
      type: "property",
      for: ["stop"],
      access: "public",
      definedIn: "dt"
    }],
    spec: "SVG2"
  },
  {
    title: "identifies IDL attributes and methods defined in SVG2 spec",
    html: `<p>The <b id="__svg__SVGNameList__length">length</b> IDL attribute
represents the length of the list, and on getting simply return
the length of the list.</p>
<p>The <b id="__svg__SVGNameList__initialize">initialize</b> method
is used to clear the list and add a single, specified value to it.
When initialize(<var>newItem</var>) is called, the following steps are run:</p>`,
    changesToBaseDfn: [{
      id: "__svg__SVGNameList__length",
      linkingText: ["length"],
      type: "attribute",
      for: ["SVGNameList"],
      access: "public"
    },
                       {
      id: "__svg__SVGNameList__initialize",
      linkingText: ["initialize"],
      type: "method",
      for: ["SVGNameList"],
      access: "public"
    }],
    spec: "SVG2"
  },
  {
    title: "identifies IDL interfaces in headings of the SVG2 spec",
    html: `<h3 id="InterfaceSVGAnimatedLengthList" class="heading">4.6.10. Interface SVGAnimatedLengthList<a class="self-link" href="#InterfaceSVGAnimatedLengthList"></a></h3>`,
    changesToBaseDfn: [{
      id: "InterfaceSVGAnimatedLengthList",
      linkingText: ["SVGAnimatedLengthList"],
      type: "interface",
      access: "public",
      heading: { id: "InterfaceSVGAnimatedLengthList", href: "about:blank#InterfaceSVGAnimatedLengthList", title: "Interface SVGAnimatedLengthList", number: "4.6.10"},
      definedIn: "heading"
    }],
    spec: "SVG2"
  },
  {
    title: "identifies a dictionary definition in an IDL fragment of the SVG2 spec",
    html: `<pre class="idl">dictionary <b id="SVGBoundingBoxOptions">SVGBoundingBoxOptions</b> {
  boolean fill = true;
  boolean stroke = false;
  boolean markers = false;
  boolean clipped = false;
};
</pre>
`,
    changesToBaseDfn: [{
      id: "SVGBoundingBoxOptions",
      linkingText: ["SVGBoundingBoxOptions"],
      type: "dictionary",
      access: "public",
      definedIn: "pre"
    }],
    spec :"SVG2",
  },

  {
    title: "includes a dfn that links to CSS2 Vendor-specific extensions section (hardcoded rule)",
    html: `<p>The CSS2.1 specification reserves a
    <dfn data-dfn-type="dfn" data-export="" id="prefixed-syntax">
      <a href="https://www.w3.org/TR/CSS2/syndata.html#vendor-keywords">prefixed syntax</a>
    </dfn>.</p>
    `,
    changesToBaseDfn: [{
      id: "prefixed-syntax",
      linkingText: ["prefixed syntax"],
      type: "dfn",
      access: "public",
      definedIn: "prose"
    }]
  },

  {
    title: "extracts a definition that starts with a '<span>' in CSS 2.1",
    html: `<p>
      A <span class="index-def" title="selector"><a name="x4">selector</a></span>
      is a chain of one or more simple selectors separated by combinators.
    </p>`,
    changesToBaseDfn: [{
      id: "x4",
      linkingText: ["selector"],
      access: "public"
    }],
    spec: "CSS2"
  },

  {
    title: "extracts a definition that starts with a '<a>' in CSS 2.1",
    html: `<p>
      A <a name="x4"><span class="index-def" title="selector"><dfn>selector</dfn></span></a>
      is a chain of one or more simple selectors separated by combinators.
    </p>`,
    changesToBaseDfn: [{
      id: "x4",
      linkingText: ["selector"],
      access: "public"
    }],
    spec: "CSS2"
  },

  {
    title: "extracts linking text in CSS 2.1 definitions",
    html: `<p>
      A <a name="x4"><span class="index-def" title="sel">selector</span></a>
      is a chain of one or more simple selectors separated by combinators.
    </p>`,
    changesToBaseDfn: [{
      id: "x4",
      linkingText: ["sel"],
      access: "public"
    }],
    spec: "CSS2"
  },

  {
    title: "maps CSS 2.1 property definitions to the right type",
    html: `<dl><dt>
      <span class="index-def" title="'width'">
        <a name="propdef-width" class="propdef-title"><strong>width</strong></a>
      </span>
    </dt>
    <dd>Blah</dd></dl>`,
    changesToBaseDfn: [{
      id: "propdef-width",
      linkingText: ["width"],
      access: "public",
      type: "property",
      definedIn: "dt"
    }],
    spec: "CSS2"
  },

  {
    title: "maps CSS 2.1 value definitions to the right type",
    html: `<span class="index-def">
      <a name="value" class="value-def">val</a>
    </span>`,
    changesToBaseDfn: [{
      id: "value",
      linkingText: ["val"],
      access: "public",
      type: "value"
    }],
    spec: "CSS2"
  },

  {
    title: "maps CSS 2.1 type definitions to the right type",
    html: `<p>Some value types may have integer values (denoted by
      <span class="index-def">
        <a name="value-def-integer" class="value-def">&lt;integer&gt;</a>
      </span>) or real number values.
    </p>`,
    changesToBaseDfn: [{
      id: "value-def-integer",
      linkingText: ["<integer>"],
      access: "public",
      type: "type"
    }],
    spec: "CSS2"
  },

  {
    title: "suppresses wrapping quotes in CSS 2.1 property definitions",
    html: `<dl><dt>
      <span class="index-def" title="'width'">
        <a name="propdef-width" class="propdef-title"><strong>'width'</strong></a>
      </span>
    </dt>
    <dd>Blah</dd></dl>`,
    changesToBaseDfn: [{
      id: "propdef-width",
      linkingText: ["width"],
      access: "public",
      type: "property",
      definedIn: "dt"
    }],
    spec: "CSS2"
  },

  {
    title: "suppresses useless suffix in CSS 2.1 property definitions",
    html: `<dl><dt>
      <span class="index-def" title="<integer>::definition of">
        <a name="value-def-integer" class="value-def">&lt;integer&gt;</a>
      </span>
    </dt>
    <dd>Blah</dd></dl>`,
    changesToBaseDfn: [{
      id: "value-def-integer",
      linkingText: ["<integer>"],
      access: "public",
      type: "type",
      definedIn: "dt"
    }],
    spec: "CSS2"
  },

  {
    title: "extracts the prose that defines a term",
    html: `<p data-defines='#foo'>
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> enters a bar.
    </p>`,
    changesToBaseDfn: [{
      htmlProse: "<dfn>Foo</dfn> enters a bar."
    }]
  },

  {
    title: "keeps basic structure for the prose that defines a term",
    html: `<div data-defines='#foo'>
      <p><dfn id='foo' data-dfn-type='dfn'>Foo</dfn> <i>enters</i> a <b>bar</b>.
      <br>The bar has <strong>2 baz</strong> on tap:</p>
      <ul>
        <li>Baz<sub>1</sub></li>
        <li>Baz<sup>2</sup></li>
      </ul>
      <pre>Foo bar baz</pre>
    </div>`,
    changesToBaseDfn: [{
      htmlProse: `<p><dfn>Foo</dfn> <i>enters</i> a <b>bar</b>.
      <br>The bar has <strong>2 baz</strong> on tap:</p>
      <ul>
        <li>Baz<sub>1</sub></li>
        <li>Baz<sup>2</sup></li>
      </ul>
      <pre>Foo bar baz</pre>`
    }]
  },

  {
    title: "keeps useful attributes in prose that defines a term",
    html: `<p data-defines='#foo'>
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> <i dir="ltr">enters</i> a <a lang="en" title="Ze ol' tavern">bar</a>.
    </p>`,
    changesToBaseDfn: [{
      htmlProse: `<dfn>Foo</dfn> <i dir="ltr">enters</i> a <a lang="en" title="Ze ol' tavern">bar</a>.`
    }]
  },

  {
    title: "keeps href in prose that defines a term",
    html: `<p data-defines='#foo'>
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> enters a <a href="#bar">bar</a>.
    </p>`,
    changesToBaseDfn: [{
      htmlProse: `<dfn>Foo</dfn> enters a <a href="about:blank#bar">bar</a>.`
    }]
  },

  {
    title: "keeps href in prose that defines a term in multi-page specs too",
    html: `<p data-defines='#foo' data-reffy-page="https://www.w3.org/TR/foo/page1.html">
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> enters a <a href="page2.html#bar">bar</a>.
    </p>`,
    changesToBaseDfn: [{
      href: "https://www.w3.org/TR/foo/page1.html#foo",
      htmlProse: `<dfn>Foo</dfn> enters a <a href="https://www.w3.org/TR/foo/page2.html#bar">bar</a>.`,
      heading: {
        href: 'https://www.w3.org/TR/foo/page1.html',
        title: ''
      }
    }]
  },

  {
    title: "extracts prose that defines a term without extra attributes",
    html: `<p data-defines='#foo'>
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> <i class="verb">enters</i> a <a hidden inert tabindex=2>bar</a>.
    </p>`,
    changesToBaseDfn: [{
      htmlProse: "<dfn>Foo</dfn> <i>enters</i> a <a>bar</a>."
    }]
  },

  {
    title: "suppresses asides from the prose that defines a term",
    html: `<div data-defines='#foo'>
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> enters a bar.
      <aside><p>I'm an aside</p></aside>
      <p class='mdn-anno'>So am I</p>
      <span class='wpt-tests-block'>Lots of tests</span>
      <span class='annotation'>And annotations</span>
      <div id='dfn-panel-foo'>A list of references</div>
    </div>`,
    changesToBaseDfn: [{
      htmlProse: "<dfn>Foo</dfn> enters a bar."
    }]
  },

  {
    title: "suppresses more complex structure from the prose that defines a term",
    html: `<div data-defines='#foo'>
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> <i class="verb">enters</i> a <a autofocus>bar</a>.
      <section>
        <h4>An inner section</h4>
      </section>
      <img src="bar.png" alt="A bar">
    </div>`,
    changesToBaseDfn: [{
      htmlProse: "<dfn>Foo</dfn> <i>enters</i> a <a>bar</a>."
    }]
  },

  {
    title: "skips HTML comments when it extracts the prose that defines a term",
    html: `<p data-defines='#foo'>
      <!-- No comment -->
      <dfn id='foo' data-dfn-type='dfn'>Foo</dfn> enters a bar.
    </p>`,
    changesToBaseDfn: [{
      htmlProse: "<dfn>Foo</dfn> enters a bar."
    }]
  },

  {
    title: "extracts CDDL definitions",
    html: `<p>
      <dfn id='foo' data-dfn-type='cddl-type'>Foo</dfn> is a CDDL type.
    </p>`,
    changesToBaseDfn: [{type: 'cddl-type'}]
  },
];

describe("Test definition extraction", function () {
  this.slow(5000);

  let browser;
  let mapIdsToHeadingsCode;
  let extractDefinitionsCode;
  let validateSchema;

  async function assertExtractedDefinition(html, dfns, spec) {
    const page = await browser.newPage();
    let pageContent = "";
    switch(spec) {
    case "html":
      pageContent = baseHtml;
      break;
    case "SVG2":
      pageContent = baseSVG2;
      break;
    };
    pageContent += html + "<script>let spec = '" + spec + "';</script>"
    page
      .on('console', message =>
          console.error(`${message.type().substr(0, 3).toUpperCase()} ${message.text()}`));
    page.setContent(pageContent);
    await page.addScriptTag({ content: mapIdsToHeadingsCode });
    await page.addScriptTag({ content: extractDefinitionsCode });

    const extractedDfns = await page.evaluate(async () => {
      const idToHeading = mapIdsToHeadings();
      return extractDefinitions(spec, idToHeading);
    });
    await page.close();

    assert.deepEqual(extractedDfns, dfns.map(d => Object.assign({}, baseDfn, {href: "about:blank#" + (d.id || baseDfn.id)}, d)));

    const errors = validateSchema(extractedDfns);
    assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
  }

  before(async () => {
    validateSchema = await getSchemaValidationFunction('extract-dfns');

    const extractDefinitionsBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/extract-dfns.mjs'),
      onwarn: _ => {}
    });
    const extractDefinitionsOutput = (await extractDefinitionsBundle.generate({
      name: 'extractDefinitions',
      format: 'iife'
    })).output;
    extractDefinitionsCode = extractDefinitionsOutput[0].code;

    const mapIdsToHeadingsBundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/map-ids-to-headings.mjs')
    });
    const mapIdsToHeadingsOutput = (await mapIdsToHeadingsBundle.generate({
      name: 'mapIdsToHeadings',
      format: 'iife'
    })).output;
    mapIdsToHeadingsCode = mapIdsToHeadingsOutput[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  tests.forEach(t => {
    it(t.title, async () => assertExtractedDefinition(t.html, t.changesToBaseDfn, t.spec));
  });


  after(async () => {
    await browser.close();
  });
});
