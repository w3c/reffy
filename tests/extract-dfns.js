const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');

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

const baseDfn = {
    id: 'foo',
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
  {title: "uses text in data-lt as linking text",
   html: "<dfn data-lt='foo \n   |\nbar' id=foo>Foo</dfn>",
   changesToBaseDfn: [{linkingText: ["foo", "bar"]}]
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
  {title: "handles HTML spec convention for defining elements",
   html: '<h4 id="the-html-element"><span class="secno">4.1.1</span> The <dfn><code>html</code></dfn> element<a href="#the-html-element" class="self-link"></a></h4>',
   changesToBaseDfn: [{id: "the-html-element",
           access: "public",
           type: "element",
           linkingText: ["html"]}],
   spec: "html"
  },
  {title: "handles HTML spec convention for defining element interfaces",
   html: '<pre><code class="idl">interface <dfn id="htmlhrelement"><c- g="">HTMLHRElement</c-></dfn> {};</code></pre>',
   changesToBaseDfn: [{id: "htmlhrelement",
           access: "public",
           type: "interface",
           linkingText: ["HTMLHRElement"]}],
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
           linkingText: [":visited"]}],
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
            for: ['EventSourceInit']}],
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
    "title": "ignores defintions imported in the HTML spec from other specs",
    html: '<li>The <dfn id="xmlhttprequest"><a href="https://xhr.spec.whatwg.org/#xmlhttprequest"><code>XMLHttpRequest</code></a></dfn> interface</li>',
    changesToBaseDfn: [{
      id: "xmlhttprequest",
      linkingText: ["XMLHttpRequest"]
    }],
    spec: "html"
  },
  {
    "title": "ignores defintions imported in the indices.html page of the HTML spec",
    html: '<section data-reffy-page="https://example.org/indices.html"><dl><dt><dfn id="text/xml"><code>text/xml</code></dfn></dt></dl></section>',
    changesToBaseDfn: [{
      id: "text/xml",
      linkingText: ["text/xml"],
      href: "https://example.org/indices.html#text/xml"
    }],
    spec: "html"
  }

];

async function assertExtractedDefinition(browser, html, dfns, spec) {
  const page = await browser.newPage();
  page.setContent((spec === "html" ? baseHtml : "") + html + "<script>let spec = '" + spec + "';</script>");
  await page.addScriptTag({
    path: path.resolve(__dirname, '../builds/browser.js')
  });

  const extractedDfns = await page.evaluate(async () => {
    return reffy.extractDefinitions(spec);
  });
  await page.close();

  assert.deepEqual(dfns.map(d => Object.assign({}, baseDfn, {href: "about:blank#" + (d.id || baseDfn.id)}, d)), extractedDfns);
}


describe("Test definition extraction", () => {
  let browser;
  before(async () => {
    browser = await puppeteer.launch({ headless: true });
  });

  tests.forEach(t => {
    it(t.title, async () => assertExtractedDefinition(browser, t.html, t.changesToBaseDfn, t.spec));
  });


  after(async () => {
    await browser.close();
  });
});
