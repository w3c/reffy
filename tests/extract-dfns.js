const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');

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
    definedIn: 'prose'
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
   changesToBaseDfn: [{heading: { id: "foo", title: "Foo"}, definedIn: "heading"}]
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
   html: "<dfn data-lt='foo \n   |\nbar' id=foo>Foo</dfn>",
   changesToBaseDfn: [{linkingText: ["foo", "bar"]}]
  },
  {title: "includes data-lt in its list of linking text",
   html: "<dfn data-lt='foo \n   |\nbar' id=foo>Foo</dfn>",
   changesToBaseDfn: [{linkingText: ["foo", "bar"]}]
  },
  {title: "handles HTML spec convention for defining elements",
   html: '<h4 id="the-html-element"><span class="secno">4.1.1</span> The <dfn><code>html</code></dfn> element<a href="#the-html-element" class="self-link"></a></h4>',
   changesToBaseDfn: [{id: "the-html-element",
           access: "public",
           type: "element",
           linkingText: ["html"],
           heading: { id: "the-html-element", title: "The html element", number: "4.1.1"},
           definedIn: "heading"}],
   spec: "html"
  },
  {title: "handles exceptions in the HTML spec convention for defining elements",
   html: '<h4 id="the-video-element"><span class="secno">4.8.9</span> The <dfn id="video"><code>video</code></dfn> element<a href="#the-video-element" class="self-link"></a></h4>',
   changesToBaseDfn: [{id: "video",
           access: "public",
           type: "element",
           linkingText: ["video"],
           heading: { id: "the-video-element", title: "The video element", number: "4.8.9"},
           definedIn: "heading"}],
   spec: "html"
  },
  {title: "handles HTML spec conventions of definitions in headings",
   html: '<h6 id="parsing-main-inselect"><span class="secno">12.2.6.4.16</span> The "<dfn>in select</dfn>" insertion mode<a href="#parsing-main-inselect" class="self-link"></a></h6>',
   changesToBaseDfn: [{id: "parsing-main-inselect",
           linkingText: ["in select"],
           heading: { id: "parsing-main-inselect", title: "The \"in select\" insertion mode", number: "12.2.6.4.16"},
           definedIn: "heading"}],
   spec: "html"
  },
  {title: "handles HTML spec convention for defining element interfaces",
   html: '<pre><code class="idl">interface <dfn id="htmlhrelement"><c- g="">HTMLHRElement</c-></dfn> {};</code></pre>',
   changesToBaseDfn: [{id: "htmlhrelement",
           access: "public",
           type: "interface",
           linkingText: ["HTMLHRElement"],
           definedIn: "pre"}],
   spec: "html"
  },
  {title: "handles finding IDL type across mixins and partial",
   html: '<dfn id="dom-navigator-taintenabled"><code>taintEnabled()</code></dfn>',
   changesToBaseDfn: [{id: "dom-navigator-taintenabled",
                       type: "method",
                       access: "public",
                       for: ["NavigatorID"],
                       linkingText: ["taintEnabled()"]}],
   spec: "html"
  },
  {title: "handles HTML spec convention for CSS selectors",
   html: '<dt><dfn id="selector-visited" data-noexport=""><code>:visited</code></dfn></dt>',
   changesToBaseDfn: [{id: "selector-visited",
           type: "selector",
           linkingText: [":visited"],
           definedIn: "dt"}],
   spec: "html"
  },
  {
    title: "detects HTML spec constructors",
    html: '<dfn id="dom-broadcastchannel"><code>BroadcastChannel()</code></dfn>',
    changesToBaseDfn: [{id: "dom-broadcastchannel",
            access: "public",
            type: "constructor",
            linkingText: ["BroadcastChannel()"],
            for: ['BroadcastChannel']}],

    spec: "html"
  },
  {
    title: "detects HTML legacy factory functions",
    html: '<dfn id="dom-audio"><code>Audio(<var>src</var>)</code></dfn>',
    changesToBaseDfn: [{id: "dom-audio",
            access: "public",
            type: "constructor",
            linkingText: ["Audio(src)"],
            for: ['HTMLAudioElement']}
    ],
    spec: "html"
  },
  {
    title: "detects methods in the global scope",
    html: '<dfn id="dom-btoa"><code id="dom-windowbase64-btoa">btoa(<var>data</var>)</code></dfn>',
    changesToBaseDfn: [{id: "dom-btoa",
            access: "public",
            type: "method",
            linkingText: ["btoa(data)"],
            for: ['WindowOrWorkerGlobalScope']
           }],
    spec: "html"
  },
  {
    title: "detects attribute in the global scope",
    html: '<dfn id="dom-navigator"><code>navigator</code></dfn>',
    changesToBaseDfn: [{id: "dom-navigator",
            access: "public",
            type: "attribute",
            linkingText: ["navigator"],
            for: ['Window']
           }],
    spec: "html"
  },
  {
    title: "handles HTML spec convention for attributes",
    html: '<dfn id="attr-html-manifest"><code>manifest</code></dfn>',
    changesToBaseDfn: [{id: "attr-html-manifest",
            access: "public",
            type: "element-attr",
            linkingText: ["manifest"],
            for: ['html']}],
    spec: "html"
  },
  {
    title: "handles HTML spec convention for methods",
    html: '<dfn id="dom-customelementregistry-whendefined"><code>whenDefined(<var>name</var>)</code></dfn>',
    changesToBaseDfn: [
      {id:"dom-customelementregistry-whendefined",
       access: "public",
       type: "method",
       linkingText: ["whenDefined(name)"],
       for: ["CustomElementRegistry"]
      }
    ],
    spec: "html"
  },
  {
    title: "handles HTML spec convention for enum values",
    html: '<dfn id="dom-canplaytyperesult-probably"><code>probably</code></dfn>',
    changesToBaseDfn: [{id: "dom-canplaytyperesult-probably",
            access: "public",
            type: "enum-value",
            linkingText: ["probably"],
            for: ['CanPlayTypeResult']}],
    spec: "html"
  },
  {
    title: "handles HTML spec convention for dictionary members",
    html: '<pre><code class="idl">dictionary EventSourceInit { boolean <dfn id="dom-eventsourceinit-withcredentials"><c- g="">withCredentials</c-></dfn> = false;};</code></pre>',
    changesToBaseDfn: [{id: "dom-eventsourceinit-withcredentials",
            access: "public",
            type: "dict-member",
            linkingText: ["withCredentials"],
            for: ['EventSourceInit'],
            definedIn: "pre"}],
    spec: "html"
  },
  {
    title: "handles HTML spec rules for “global” event handlers",
    html: '<td><dfn id="handler-oncopy"><code>oncopy</code></dfn> </td>',
    changesToBaseDfn: [
      {id: "handler-oncopy",
            access: "public",
            type: "attribute",
            linkingText: ["oncopy"],
            for: ['DocumentAndElementEventHandlers']}
    ],
    spec:"html"
  },
  {
    title: "handles HTML spec convention for interface-bound event handlers",
    html: '<td><dfn id="handler-texttracklist-onchange"><code>onchange</code></dfn> </td>',
    changesToBaseDfn: [{id: "handler-texttracklist-onchange",
            access: "public",
            type: "attribute",
            linkingText: ["onchange"],
            for: ['TextTrackList']}],
    spec: "html"
  },
  {
    title: "handles exceptions to HTML spec convention for event handlers",
    html: '<td><dfn id="handler-tracklist-onchange"><code>onchange</code></dfn> </td>',
    changesToBaseDfn: [{id: "handler-tracklist-onchange",
            access: "public",
            type: "attribute",
            linkingText: ["onchange"],
            for: ['AudioTrackList', 'VideoTrackList']}],
    spec: "html"
  },
  {
    title: "handles exceptions to HTML spec convention for event handlers",
    html: '<td><dfn id="handler-appcache-onchecking"><code>onchecking</code></dfn> </td>',
    changesToBaseDfn: [{id: "handler-appcache-onchecking",
            access: "public",
            type: "attribute",
            linkingText: ["onchecking"],
            for: ['ApplicationCache']}],
    spec: "html"
  },
  {
    title: "handles exceptions to HTML spec convention for method attributions",
    html: '<dfn id="dom-navigator-canplaytype"><code>canPlayType(<var>type</var>)</code></dfn>',
    changesToBaseDfn: [{id: "dom-navigator-canplaytype",
            access: "public",
            type: "method",
            linkingText: ["canPlayType(type)"],
            for: ['HTMLMediaElement']}],
    spec: "html"
  },
  {
    title: "doesn't mess up when HTML follows regular conventions",
    html: '<td><dfn data-dfn-for="HTMLElement,Document,Window,GlobalEventHandlers" id="handler-onmouseup" data-dfn-type="attribute" data-export=""><code>onmouseup</code></dfn></td>',
    changesToBaseDfn: [{id: "handler-onmouseup",
            access: "public",
            type: "attribute",
            linkingText: ["onmouseup"],
            for: ['HTMLElement','Document','Window','GlobalEventHandlers']}],
    spec: "html"
  },
  {
    "title": "ignores definitions imported in the HTML spec from other specs",
    html: '<li>The <dfn id="xmlhttprequest"><a href="https://xhr.spec.whatwg.org/#xmlhttprequest"><code>XMLHttpRequest</code></a></dfn> interface</li>',
    changesToBaseDfn: [{
      id: "xmlhttprequest",
      linkingText: ["XMLHttpRequest"]
    }],
    spec: "html"
  },
  {
    "title": "ignores definitions imported in the indices.html page of the HTML spec",
    html: '<section data-reffy-page="https://example.org/indices.html"><dl><dt><dfn id="text/xml"><code>text/xml</code></dfn></dt></dl></section>',
    changesToBaseDfn: [{
      id: "text/xml",
      linkingText: ["text/xml"],
      href: "https://example.org/indices.html#text/xml",
      definedIn: "dt"
    }],
    spec: "html"
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
      heading: { id: "LinkElement", title: "External style sheets: the effect of the HTML ‘link’ element", number: "6.3"},
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
      heading: { id: "InterfaceSVGAnimatedLengthList", title: "Interface SVGAnimatedLengthList", number: "4.6.10"},
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
  }
];

describe("Test definition extraction", function () {
  this.slow(5000);

  let browser;
  let mapIdsToHeadingsCode;
  let extractDefinitionsCode;

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
  }

  before(async () => {
    const extractDefinitionsBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-dfns.mjs'),
      onwarn: _ => {}
    });
    const extractDefinitionsOutput = (await extractDefinitionsBundle.generate({
      name: 'extractDefinitions',
      format: 'iife'
    })).output;
    extractDefinitionsCode = extractDefinitionsOutput[0].code;

    const mapIdsToHeadingsBundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/map-ids-to-headings.mjs')
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
