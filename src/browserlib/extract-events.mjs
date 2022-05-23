export default function (spec) {
  let events = [];
  // ignore DOM spec which uses a matching table format
  // to map to legacy event types
  if (spec.shortname !== "dom") {
    document.querySelectorAll("table").forEach(table => {
      const firstHeading = table.querySelector("thead tr th")?.textContent?.trim();
      if (firstHeading && firstHeading.match(/^Event/) && firstHeading !== "Event handler") {
	table.querySelectorAll("tbody tr").forEach(tr => {
	  const event = {};
	  const eventTypeEl = tr.querySelector("*:first-child");
	  const annotations = eventTypeEl.querySelectorAll("aside, .mdn-anno");
	  annotations.forEach(n => n.remove());

	  event.type = eventTypeEl.textContent.trim();
	  event.interface = tr.querySelector("td:nth-child(2) a")?.textContent;
	  events.push(event);
	});
      }
    });
  }
  if (events.length === 0) {
    // Look for the DOM-suggested sentence "Fire an event X using Y"
    [...document.querySelectorAll("a")].filter(a => a.href === "https://dom.spec.whatwg.org/#concept-event-fire" || a.href === "https://w3c.github.io/ServiceWorker/#fire-functional-event").forEach(a => {
      const container = a.parentNode;
      let m = container.textContent.match(/fir(e|ing)\sa(n|\s+functional)\s+event\s+named\s+"?([a-z]+)/i);
      if (m) {
	const name = m[3];
	const event = {};
	// this matches "fire an event named eventName" in battery-status and media capture main, named type in fullscreen
	if (name === 'eventName' || m[1] === 'type') return;
	// TODO: bail out if already detected? or check targets first?
	event.type = name;
	const iface = [...container.querySelectorAll("a[href]")].find(n => n.textContent.match(/^([A-Z]+[a-z0-9]*)+Event$/));
	if (iface) {
	  event.interface = iface.textContent.trim();
	}
	events.push(event);
      }
    });
  }
  [...document.querySelectorAll('dfn[data-dfn-type="event"')].forEach(dfn => {
    const type = dfn.textContent.trim();
    if (!events.find(e => e.type === type)) {
      events.push({type, interface: null});
      console.error("No interface hint found in " + spec.shortname);
    }
  });
  return events;
}
