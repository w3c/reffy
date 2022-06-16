const { assert } = require('chai');
const puppeteer = require('puppeteer');
const path = require('path');
const rollup = require('rollup');

const defaultResults = (format, {successIface} = {successIface: "SuccessEvent"}) =>  [
  {
    type: "success",
    interface: successIface,
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
  <tr><th>Event type</th><th>Interface</th><th>Bubbles</th></tr>
</thead>
<tbody>
  <tr><th><dfn id=success>success</dfn></th><td><a href=''>SuccessEvent</a></td><td>Yes</td></tr>
  <tr><th><dfn id=error>error</dfn></th><td><a href=''>ErrorEvent</a></td><td>No</td></tr>
</tbody></table>${defaultIdl}`,
    res: defaultResults("summary table")
  },
  {
    title: "extracts events from an event described by a  table with data spread across rows",
    html: `
<section>
<h3><code>success</code> Event</h3>
<table class="event-definition" id='success'>
<tbody>
<tr><th>Type</th><td><code>success</code></td>
<tr><th>Interface</th><td><code>SuccessEvent</code></td>
<tr><th>Stuff</th><td></td>
<tr><th>Bubbles</th><td><code>Yes</code></td>
<tr><th>Targets</th><td><code>Example</code></td>
</section>
<section>
<h3><code>error</code> Event</h3>
<table class="event-definition" id=error>
<tbody>
<tr><th>Type</th><td><code>error</code></td>
<tr><th>Interface</th><td><code>ErrorEvent</code></td>
<tr><th>Stuff</th><td></td>
<tr><th>Bubbles</th><td><code>No</code></td>
<tr><th>Targets</th><td><code>Example</code></td>
</section>`,
    res: defaultResults("definition table")
  },
  {
    title: "extracts events from an event described by a CSS def table with data spread across rows, completed by an IDL fragment",
    html: `<h3><code>success</code> Event</h3>
<table class="def" id='success'>
<tbody>
<tr><th>Type<td>success
<tr><th>Bubbles<td>Yes
<tr><th>Interface<td>SuccessEvent
</table>
<h3><code>error</code> Event</h3>
<table class="def" id='error'>
<tbody>
<tr><th>Type<td>error
<tr><th>Bubbles<td>no
<tr><th>Interface<td>ErrorEvent
</table>
${defaultIdl}`,
    res: defaultResults("css definition table")
  },
  {
    title: "extracts events from an event mentioned in a 'Fire an event' context, completed by an IDL fragment",
    html: `<p id=success><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a> named <code>success</code> using <a href=''>SuccessEvent</a> with the <code>bubbles</code> attribute initialized to <code>true</code></p>
<p id=error><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a> named <code>error</code> using <a href=''>ErrorEvent</a> with the <code>bubbles</code> attribute initialized to <code>false</code></p>${defaultIdl}`,
    res: defaultResults("fire an event phrasing")
  },
  {
    title: "extracts events from an event mentioned in a 'Fire Functional Event' context, completed by an IDL fragment",
    html: `<p id=success><a href='https://w3c.github.io/ServiceWorker/#fire-functional-event'>Fire Functional Event</a> <code>success</code> with the <code>bubbles</code> attribute initialized to <code>true</code></p>
<p id=error><a href='https://dom.spec.whatwg.org/#concept-event-fire'>Fire an event</a> named <code>error</code> using <a href=''>ErrorEvent</a> with the <code>bubbles</code> attribute initialized to <code>false</code></p>${defaultIdl}`,
    res: defaultResults("fire an event phrasing", {successIface: "ExtendableEvent"})
  },
  {
    title: "extracts events from event definitions",
    html: `<p><dfn id=success data-dfn-type=event data-dfn-for=Example>success</dfn> is an event, not a state.</p>`,
    res: [
      {
	type: "success",
	interface: null,
	targets: ["Example"],
	src: { format: "dfn", href:"about:blank#success"},
	href:"about:blank#success"
      }
    ]
  }
];

describe("Events extraction", function () {
  this.slow(5000);
  let browser;
  let extractEventsCode;

  before(async () => {
    const bundle = await rollup.rollup({
      input: path.resolve(__dirname, '../src/browserlib/extract-events.mjs'),
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
      const pageContent = t.html + "<script>let spec = '" + (t.spec || "example") + "';</script>";
      page.setContent(pageContent);
      await page.addScriptTag({ content: extractEventsCode });

      const extractedEvents = await page.evaluate(async () => {
        return extractEvents(spec);
      });
      await page.close();
      assert.deepEqual(extractedEvents, t.res);
    });
  });

  after(async () => {
    await browser.close();
  });
});

