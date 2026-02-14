import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { rollup } from 'rollup';
import { getSchemaValidationFunction } from '../src/lib/util.js';
const scriptPath = path.dirname(fileURLToPath(import.meta.url));

const defaultResults = (format, {successIface} = {successIface: "SuccessEvent"}) =>  [
  {
    type: "success",
    interface: successIface,
    cancelable: true,
    targets: [ "Example" ],
    bubbles: true,
    href: "about:blank#success",
    src: {
      format,
      href: "about:blank#success"
    }
  },
  {
    type: "error",
    interface: "ErrorEvent",
    cancelable: false,
    targets: [ "Example" ],
    bubbles: false,
    href: "about:blank#error",
    src: {
      format,
      href: "about:blank#error"
    }
  }
];

const defaultIdl = `<pre class=idl>interface Example {
  attribute EventHandler onsuccess;
  attribute EventHandler onerror;
};</pre>`;

const tests = [
  {
    title: "extracts events from a summary table with data spread across columns, completed by an IDL fragment",
    html: `<table>
<thead>
  <tr><th>Event type</th><th>Interface</th><th>Bubbles</th><th>Cancelable</th></tr>
</thead>
<tbody>
  <tr><th><dfn id=success>success</dfn></th><td><a href=''>SuccessEvent</a></td><td>Yes</td><td>✓</td></tr>
  <tr><th><dfn id=error>error</dfn></th><td><a href=''>ErrorEvent</a></td><td>No</td><td>No</td></tr>
</tbody></table>${defaultIdl}`,
    res: defaultResults("summary table")
  },
  {
    title: "extracts events from an event described by a CSS def table with data spread across rows, completed by an IDL fragment",
    html: `<h3><code>success</code> Event</h3>
<table class="def" id='success'>
<tbody>
<tr><th>Type<td>success
<tr><th>Bubbles<td>Yes
<tr><th>Cancelable<td>Yes
<tr><th>Interface<td>SuccessEvent
</table>
<h3><code>error</code> Event</h3>
<table class="def" id='error'>
<tbody>
<tr><th>Type<td>error
<tr><th>Bubbles<td>no
<tr><th>Cancelable<td>no
<tr><th>Interface<td>ErrorEvent
</table>
${defaultIdl}`,
    res: defaultResults("css definition table")
  },
  {
    title: "extracts events from an event described by a CSS dl list",
    html: `<h3>Types of <code>ErrorEvent</code></h3>
<dl>
<dt><dfn data-dfn-for=Example data-dfn-type=event id=success>success</dfn></dt>
<dd><ul>
<li>Bubbles: Yes</li>
<li>Cancelable: Yes</li>
</ul></dd>
<dt><dfn data-dfn-for=Example data-dfn-type=event id=error>error</dfn></dt>
<dd><ul>
<li>Bubbles: No</li>
<li>Cancelable: No</li>
</ul></dd>
`,
    res: defaultResults("dfn", {successIface: "ErrorEvent"})
  },
  {
    title: "extracts events from an event mentioned in a 'Fire an event' context, completed by an IDL fragment",
    html: `<p id=success><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a> named <code>success</code> using <a href=''>SuccessEvent</a> with the <code>bubbles</code> and <code>cancelable</code> attributes initialized to <code>true</code></p>
<p id=error><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a> named <code>error</code> using <a href=''>ErrorEvent</a> with the <code>bubbles</code> attribute initialized to <code>false</code> and the <code>cancelable</code> attribute set to <code>false</code></p>${defaultIdl}`,
    res: defaultResults("fire an event phrasing")
  },
  {
    title: "extracts events from an event mentioned in a 'Fire Functional Event' context, completed by an IDL fragment",
    html: `<p id=success><a href='https://w3c.github.io/ServiceWorker/#fire-functional-event'>Fire Functional Event</a> <code>success</code> with the <code>bubbles</code> attribute initialized to <code>true</code> and the <code>cancelable</code> attribute initialized to <code>true</code></p>
<p id=error><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a> named <code>error</code> using <a href=''>ErrorEvent</a> with the <code>bubbles</code> and <code>cancelable</code> attributes initialized to <code>false</code></p>${defaultIdl}`,
    res: defaultResults("fire an event phrasing", {successIface: "ExtendableEvent"})
  },
  {
    title: "ignores invalid IDL fragments",
    html: `<p id=success><a href='https://w3c.github.io/ServiceWorker/#fire-functional-event'>Fire Functional Event</a> <code>success</code> with the <code>bubbles</code> attribute initialized to <code>true</code></p>${defaultIdl.replace(/attribute/, 'allezbut')}`,
    res: [ {
      type: "success", interface: "ExtendableEvent", bubbles: true,
      href: "about:blank#success",
      src: { format: "fire an event phrasing", href: "about:blank#success" }
    } ]
  },
  {
    title: "extracts events from event definitions",
    html: `<p><dfn id=success data-dfn-type=event data-dfn-for=Example>success</dfn> is an event, not a state.</p>`,
    res: [
      {
	type: "success",
	targets: ["Example"],
	src: { format: "dfn", href:"about:blank#success"},
	href:"about:blank#success"
      }
    ]
  },
  {
    title: "Associate events href to correct url in multipage spec",
    html: `<section data-reffy-page='https://example.org/indices.html'><table>
<thead>
  <tr><th>Event type</th><th>Interface</th><th>Bubbles</th></tr>
</thead>
<tbody>
  <tr><th><dfn id=success>success</dfn></th><td><a href=''>SuccessEvent</a></td><td>Yes</td></tr></tbody></table>`,
    spec: 'html',
    res: [
      {
	bubbles: true,
	type: "success",
	interface: "SuccessEvent",
	src: { format: "summary table", href:"https://example.org/indices.html#success"},
	href:"https://example.org/indices.html#success",
	isExtension: true
      }
    ]
  },
  {
    title: "Extract multiple events fired from a single container element",
    html: `<p id='multievents'>If there is an error, <a href='https://dom.spec.whatwg.org/#concept-event-fire'>fire an event</a> named <dfn id='error'>error</dfn> using <a href=''>ErrorEvent</a>, otherwise <a href='https://dom.spec.whatwg.org/#concept-event-fire'>fire an event</a> named <dfn id=success>success</dfn> using <a href=''>Event</a></p>`,
    res: [
      {
        "href": "about:blank#error",
        "interface": "ErrorEvent",
        "src": {
          "format": "fire an event phrasing",
          "href": "about:blank#multievents"
        },
        "type": "error"
      },
      {
        "href": "about:blank#success",
        "interface": "Event",
        "src": {
          "format": "fire an event phrasing",
          "href": "about:blank#multievents"
        },
        "type": "success"
      }
    ]
  },
  {
    title: "does not get confused by asides",
    html: `<p id=success><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a>
      named <code>success</code><span><span class="mdn-anno">Info</span></span> using <a href=''>SuccessEvent</a> with the <code>bubbles</code> and <code>cancelable</code> attributes initialized to <code>true</code>.</p>
      <p id=error><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a> named <code>error</code> using <a href=''>ErrorEvent</a> with the <code>bubbles</code> attribute initialized to <code>false</code> and must not be cancelable</p>
      ${defaultIdl}`,
    res: defaultResults("fire an event phrasing")
  },
  {
    title: "supports 'given' on top of 'named' to specify the event type and interface",
    html: `<p id=success><a href="https://w3c.github.io/ServiceWorker/#fire-functional-event">Fire Functional Event</a>
      given <code>success</code>, <code>NotificationEvent</code>.
    </p>`,
    res: [
      {
        "href": "about:blank#success",
        "interface": "NotificationEvent",
        "src": {
          "format": "fire an event phrasing",
          "href": "about:blank#success"
        },
        "type": "success"
      }
    ]
  },
  {
    title: "does not extract variable names as event types",
    html: `<p>To fire a service worker notification event named <var>name</var>:
      run <a href="https://w3c.github.io/ServiceWorker/#fire-functional-event">Fire Functional Event</a>
      given <var>name</var>.
    </p>`,
    res: []
  },
  {
    title: "extracts an event from an event-definition table",
    html: `<section id="events">
    <table class="event-definition">
     <tbody>
      <tr>
       <th>Type</th>
       <td><strong><code>auxclick</code></strong></td>
      </tr>
      <tr>
       <th>Interface</th>
       <td><code>PointerEvent</code></td>
      </tr>
      <tr>
       <th>Bubbles</th>
       <td>Yes</td>
      </tr>
      <tr>
       <th>Trusted Targets</th>
       <td><code>Element</code>       </td>
      </tr>
      <tr>
       <th>Cancelable</th>
       <td>Yes</td>
      </tr>
     </tbody>
    </table>
    </section>`,
    res: [
      {
        interface: "PointerEvent",
        src: {
          format: "event table",
          href: "about:blank#events"
        },
        type: "auxclick",
        targets: [
          "Element"
        ],
        bubbles: true,
        cancelable: true
      }
    ]
  },
  {
    title: "extracts an event from an event-definition table and links it to dfn",
    html: `<section id="events">
    <div class="header-wrapper">
      <h4 id="x4-4-1-auxclick">
        <bdi class="secno">4.4.1<!---0.614927%--> </bdi>
        <dfn class="export" data-dfn-type="event" data-export="" id="dfn-auxclick">auxclick</dfn>
      </h4>
    </div>
    <table class="event-definition">
     <tbody>
      <tr>
       <th>Type</th>
       <td><strong><code>auxclick</code></strong></td>
      </tr>
      <tr>
       <th>Interface</th>
       <td><code>PointerEvent</code></td>
      </tr>
      <tr>
       <th>Bubbles</th>
       <td>Yes</td>
      </tr>
      <tr>
       <th>Trusted Targets</th>
       <td><code>Element</code>       </td>
      </tr>
      <tr>
       <th>Cancelable</th>
       <td>Yes</td>
      </tr>
     </tbody>
    </table>
    </section>`,
    res: [
      {
        href: "about:blank#dfn-auxclick",
        interface: "PointerEvent",
        src: {
          format: "event table",
          href: "about:blank#events"
        },
        type: "auxclick",
        targets: [
          "Element"
        ],
        bubbles: true,
        cancelable: true
      }
    ]
  }
];

describe("Events extraction", function () {
  let browser;
  let extractEventsCode;
  let validateSchema;

  before(async () => {
    validateSchema = await getSchemaValidationFunction('extract-events');
    const bundle = await rollup({
      input: path.resolve(scriptPath, '../src/browserlib/extract-events.mjs'),
      onwarn: _ => {}
    });
    const output = (await bundle.generate({
      name: 'extractEvents',
      format: 'iife'
    })).output;
    extractEventsCode = output[0].code;

    browser = await puppeteer.launch({ headless: true });
  });

  tests.forEach(t => {
    it(t.title, async () => {
      const page = await browser.newPage();
      const pageContent = t.html + "<script>let spec = {shortname: '" + (t.spec || "example") + "', crawled: 'about:blank'};</script>";
      page.setContent(pageContent);
      await page.addScriptTag({ content: extractEventsCode });

      const extractedEvents = await page.evaluate(async () => {
        return extractEvents(spec);
      });
      await page.close();
      assert.deepEqual(extractedEvents, t.res);

      const errors = validateSchema(extractedEvents);
      assert.strictEqual(errors, null, JSON.stringify(errors, null, 2));
    });
  });

  after(async () => {
    await browser.close();
  });
});

