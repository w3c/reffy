function fromEventElementToTargetInterfaces(eventEl) {
  if (eventEl && (eventEl.dataset?.dfnFor || eventEl.dataset?.linkFor)) {
    return (eventEl.dataset.dfnFor || eventEl.dataset.linkFor).split(",").map(t => t.trim());
  } else if (eventEl.getAttribute("href")?.startsWith("#")) {
    const dfn = document.getElementById(eventEl.getAttribute("href").slice(1));
    if (dfn && dfn.dataset?.dfnFor) {
      return dfn.dataset.dfnFor.split(",").map(t => t.trim());
    }
  }
}

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
	  const eventEl = tr.querySelector("*:first-child");
	  const annotations = eventEl.querySelectorAll("aside, .mdn-anno");
	  annotations.forEach(n => n.remove());
	  // if we find a <dfn>, or a <a> pointing to an internal anchor
	  // (the latter is needed since the HTML spec table includes
	  // links to pointer events)
	  if (eventEl.querySelector("dfn,a[href^='#']")) {
	    event.type = eventEl.textContent.trim();
	    event.targets = fromEventElementToTargetInterfaces(eventEl.querySelector("dfn,a[href^='#']"));

	    event.interface = tr.querySelector("td:nth-child(2) a")?.textContent;
	    events.push(event);
	  }
	});
      }
    });
  }
  if (events.length === 0) {
    // Look for the DOM-suggested sentence "Fire an event named X"
    // or the Service Worker extension of "fire a functional event named"
    [...document.querySelectorAll("a")].filter(a => a.href === "https://dom.spec.whatwg.org/#concept-event-fire" || a.href === "https://w3c.github.io/ServiceWorker/#fire-functional-event").forEach(a => {
      const container = a.parentNode;
      let m = container.textContent.match(/fir(e|ing)\sa(n|\s+functional)\s+event\s+named\s+"?(?<eventName>[a-z]+)/i);
      if (m) {
	const name = m.groups.eventName;
	const event = {};
	// this matches "fire an event named eventName" in battery-status and media capture main, named type in fullscreen
	if (name === 'eventName' || name === 'type') {
	  event.type = null;
	} else {
	  event.type = name;
	  const eventEl = [...container.querySelectorAll("a,dfn")].find(n => n.textContent.trim() === event.type);
	  event.targets = fromEventElementToTargetInterfaces(eventEl);
	  // if we have already detected this combination, skip it
	  if (events.find(e => e.type === name && e.targets.sort().join("|") === event.targets.sort().join("|"))) {
	    return;
	  }
	}
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
    if (!events.find(e => e.type === type && e.targets.sort().join("|") === fromEventElementToTargetInterfaces(dfn)?.sort()?.join("|"))) {
      events.push({type, interface: null, targets: fromEventElementToTargetInterfaces(dfn)});
      console.error("[reffy] No interface hint found in " + spec.title);
    }
  });
  return events;
}
