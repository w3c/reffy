import informativeSelector from './informative-selector.mjs';
import extractWebIdl from './extract-webidl.mjs';
import {parse} from "../../node_modules/webidl2/index.js";
import getAbsoluteUrl from './get-absolute-url.mjs';

const isSameEvent = (e1, e2) => (e1.href && e1.href === e2.href) || (e1.type === e2.type && e1.targets?.sort()?.join("|") === e2.targets?.sort()?.join("|"));

const singlePage = !document.querySelector('[data-reffy-page]');

const href = el => getAbsoluteUrl(el || document.body.querySelector("*[id]"), {singlePage});

export default function (spec) {
  // Used to find eventhandler attributes
  const idl = extractWebIdl();
  const idlTree = parse(idl);
  const idlInterfaces = idlTree.filter(item => item.type === "interface" || item.type === "interface mixin");

  // associate event names from event handlers to interfaces with such an handler
  const handledEventNames = idlInterfaces.map(iface => iface.members.filter(m => m.idlType?.idlType === "EventHandler" && m.type === "attribute" && m.name?.startsWith("on")).map(m => [m.name.slice(2), iface.name])).flat().reduce((acc, b) => {
    if (!acc[b[0]]) acc[b[0]] = [];
    acc[b[0]].push(b[1]);
    return acc;
  }, {});


  function fromEventElementToTargetInterfaces(eventEl) {
    if (!eventEl) return;

    if (eventEl.dataset?.dfnFor || eventEl.dataset?.linkFor) {
      return (eventEl.dataset.dfnFor || eventEl.dataset.linkFor).split(",").map(t => t.trim());
    } else if (eventEl.getAttribute("href")?.startsWith("#")) {
      const dfn = document.getElementById(eventEl.getAttribute("href").slice(1));
      if (dfn && dfn.dataset?.dfnFor) {
	return dfn.dataset.dfnFor.split(",").map(t => t.trim());
      }
    } else if (handledEventNames[eventEl.textContent]?.length) {
      // Search for on<event> EventHandler in IDL
    const matchingInterfaces = handledEventNames[eventEl.textContent];
      if (matchingInterfaces.length === 1) {
	// only one such handler, we assume it's a match
	return matchingInterfaces;
      } else {
	console.error("[reffy] Multiple event handler named " + eventEl.textContent + ", cannot associate reliably to an interface in " + spec.title);
      }
    }
  }


  let events = [];
  // Look for event summary tables
  // ignore DOM spec which uses a matching table format
  // to map to legacy event types
  let hasStructuredData = false;
  if (spec.shortname !== "dom") {
    document.querySelectorAll("table").forEach(table => {
      const firstHeading = table.querySelector("thead tr th")?.textContent?.trim();
      if (firstHeading && firstHeading.match(/^Event/) && firstHeading !== "Event handler") {
	hasStructuredData = true;
	// Useful e.g. for pointerevents
	const bubblingInfoColumn = [...table.querySelectorAll("thead th")].findIndex(n => n.textContent.trim().match(/^bubbl/i));
	const interfaceColumn = [...table.querySelectorAll("thead th")].findIndex(n => n.textContent.trim().match(/^interface/i));
	table.querySelectorAll("tbody tr").forEach(tr => {
	  const event = {};
	  const eventEl = tr.querySelector("*:first-child");
	  const annotations = eventEl.querySelectorAll("aside, .mdn-anno");
	  annotations.forEach(n => n.remove());

	  let el = eventEl.querySelector("dfn,a");
	  if (el && el.tagName === "A" && el.getAttribute("href").startsWith("https:")) {
	    // we skip when we hit a link pointing to an external spec
	    // (this is needed since the HTML spec table includes
	    // links to pointer events)
	    return;
	  }
	  if (!el) {
	    el = eventEl.querySelector("code");
	  }
	  if (el) {
	    if (el.tagName === "DFN" && el.id) {
	      event.href = href(el);
	    } else if (el.tagName === "A") {
	      event.href = href(document.getElementById(el.getAttribute("href").slice(1)));
	    }
	    event.src = { format: "summary table", href: href(el.closest('*[id]')) };
	    event.type = eventEl.textContent.trim();
	    event.targets = fromEventElementToTargetInterfaces(eventEl.querySelector("dfn,a[href^='#']"));
	    if (bubblingInfoColumn >= 0) {
	      event.bubbles = tr.querySelector(`td:nth-child(${bubblingInfoColumn + 1})`)?.textContent?.trim() === "Yes";
	    }
	    if (interfaceColumn >= 0) {
	      event.interface = tr.querySelector(`td:nth-child(${interfaceColumn + 1}) a`)?.textContent ?? tr.querySelector(`td:nth-child(${interfaceColumn + 1}) code`)?.textContent;
	    }
	    events.push(event);
	  }
	});
      } else if (table.className === "event-definition") {
	hasStructuredData = true;
	// Format used e.g. in uievents
	const eventName = table.querySelector("tbody tr:first-child td:nth-child(2)")?.textContent.trim();
	let iface = table.querySelector("tbody tr:nth-child(2) td:nth-child(2)")?.textContent.trim();
	let bubbles = table.querySelector("tbody tr:nth-child(4) td:nth-child(2)")?.textContent.trim() === "Yes";
	// Prose description, we skip it
	if (iface.match(/\s/)) {
	  iface = null;
	}
	let targets = table.querySelector("tbody tr:nth-child(5) td:nth-child(2)")?.textContent?.split(",")?.map(t => t.trim());
	if (targets && targets.find(t => t.match(/\s/))) {
	  // Prose description, skip it
	  targets = null;
	}
	if (eventName) {
	  events.push({type: eventName, interface: iface, targets, bubbles, src: { format: "definition table", href: href(table.closest('*[id]')) }, href: href(table.closest('*[id]')) });
	}
      } else if (table.className === "def") {
	// Used in https://drafts.csswg.org/css-nav-1/
	const rowHeadings = [...table.querySelectorAll("tbody th")];
	if (rowHeadings.find(th => th.textContent.trim() === "Bubbles")) {
	  const eventTypeRow = [...table.querySelectorAll("tbody th")].findIndex(n => n.textContent.trim().match(/^type/i));
	  const bubblingInfoRow = [...table.querySelectorAll("tbody th")].findIndex(n => n.textContent.trim() === "Bubbles");
	  const interfaceRow = [...table.querySelectorAll("tbody th")].findIndex(n => n.textContent.trim().match(/^interface/i));
	  const eventName = table.querySelector(`tr:nth-child(${eventTypeRow + 1}) td:nth-child(2)`)?.textContent?.trim();
	  const bubbles = table.querySelector(`tr:nth-child(${bubblingInfoRow + 1}) td:nth-child(2)`)?.textContent?.trim() === "Yes";
	  const iface = table.querySelector(`tr:nth-child(${interfaceRow + 1}) td:nth-child(2)`)?.textContent?.trim();
	  if (eventName) {
	    events.push({type: eventName, interface: iface, bubbles, src: { format: "css definition table", href: href(table.closest('*[id]')) }, href: href(table.closest('*[id]')) });
	  }
	}
      }
    });
  }
  // Look for the DOM-suggested sentence "Fire an event named X"
  // or the Service Worker extension of "fire (a) functional event named"
  [...document.querySelectorAll("a")].filter(a => !a.closest(informativeSelector)
					     && (a.href === "https://dom.spec.whatwg.org/#concept-event-fire"
						 || a.href === "https://w3c.github.io/ServiceWorker/#fire-functional-event" || a.href === "https://www.w3.org/TR/service-workers-1/#fire-functional-event-algorithm" || a.href === "https://www.w3.org/TR/service-workers-1/#fire-functional-event"
						|| a.href === "https://w3c.github.io/pointerevents/#dfn-fire-a-pointer-event")
					    )
    .forEach(a => {
      const container = a.parentNode;
      let phrasing;
      let m = container.textContent.match(/fir(e|ing)\s+a(n|\s+pointer)\s+event\s+named\s+"?(?<eventName>[a-z]+)/i);
      if (m) {
	if (m[2] === "n") {
	  phrasing = "fire an event";
	} else {
	  phrasing = "fire a pointer event";
	}
      } else {
	m = container.textContent.match(/fir(e|ing)\sa?\s*functional\s+event\s+(named\s+)?"?(?<eventName>[a-z]+)/i);
	if (m) {
	  phrasing = "fire functional event";
	}
      }
      if (phrasing) {
	const name = m.groups.eventName;
	let newEvent = true;
	let event = {src: { format: "fire an event phrasing", href: href(a.closest('*[id]')) }, href: href(a.closest('*[id]')) };
	// this matches "fire an event named eventName" in battery-status and media capture main, named type in fullscreen, named e, event in html
	if (name === 'eventName' || name === 'type' || name === 'e' || name === 'event') {
	  return;
	} else {
	  event.type = name;
	  // looking preferably for a or dfn elements, falling back to code
	  const eventEl = [...container.querySelectorAll("a,dfn")].find(n => n.textContent.trim() === event.type) || [...container.querySelectorAll("code")].find(n => n.textContent.trim() === event.type);
	  if (eventEl) {
	    if (eventEl.tagName === "A" && eventEl.getAttribute("href")) {
	      // If the event being fired is from another spec, let's skip it
	      if (eventEl.getAttribute("href").startsWith("https://")) return;

	      // otherwise, use the target of the link as our href
	      event.href = eventEl.href;
	    } else if (eventEl.tagName === "DFN" && eventEl.id) {
	      eventEl.href = href(eventEl);
	    }
	    event.targets = fromEventElementToTargetInterfaces(eventEl);
	  }
	  // if we have already detected this combination, skip it
	  if (events.find(e => isSameEvent(event, e))) {
	    newEvent = false;
	    event = events.find(e => isSameEvent(event, e));
	  }
	}
	if (!event.interface) {
	  const iface = [...container.querySelectorAll("a[href]")].find(n => n.textContent.match(/^([A-Z]+[a-z0-9]*)+Event$/));
	  if (iface) {
	    event.interface = iface.textContent.trim();
	  } else {
	    // Fire an event ⇒ Event interface
	    if (phrasing === "fire an event") {
	      event.interface = "Event";
	    } else if (phrasing === "fire a pointer event") {
	      // Fire a pointerevent ⇒ PointerEvent interface
	      event.interface = "PointerEvent";
	    } else {
	    // Functional event ⇒ Extendable interface
	      event.interface = "ExtendableEvent";
	    }
	  }
	}
	if (event.bubbles === undefined) {
	  if (container.textContent.match(/bubbles attribute/)) {
	    if (container.textContent.match(/true/)) {
	      event.bubbles = true;
	    } else if (container.textContent.match(/false/)) {
	      event.bubbles = false;
	    }
	  } else if (container.textContent.match(/bubbles/) || container.textContent.match(/bubbling/)) {
	    event.bubbles = true;
	  } else if (container.textContent.match(/not bubble/)) {
	    event.bubbles = false;
	  }
	}
	if (newEvent) {
	  events.push(event);
	}
      }
    });

  // find events via IDL on<event> attributes with type EventHandler
  for (let eventName of Object.keys(handledEventNames)) {
    const matchingEvents = events.filter(e => e.type === eventName);
    if (matchingEvents.length === 0 && !hasStructuredData) {
      // We have not encountered such an event so far
      for (let iface of handledEventNames[eventName]) {
	events.push({type: eventName, targets: [iface], interface: null, src: { format: "IDL eventHandler", href: href(document.body) } }); // FIXME: find id of the IDL fragment
      }
    } else if (matchingEvents.length === 1) {
      // A single matching event, we assume all event handlers relate to it
      const [matchingEvent] = matchingEvents;
      // assign all interfaces at once if none is set
      // but don't add to existing interfaces otherwise
      if (!matchingEvent.targets) {
	matchingEvent.targets = handledEventNames[eventName];
      } else if (!hasStructuredData) {
	const missingIface = handledEventNames[eventName].find(iface => !matchingEvent.targets.includes(iface));
	if (missingIface) {
	  console.warn("[reffy] More event handlers matching name " + eventName + ", e.g. on " + missingIface + " than ones identified in spec definitions");
	}
      }
    } else {
      // More than one event with that name
      // we can only check if this matches known information
      // to warn of the gap otherwise
      for (let iface of handledEventNames[eventName]) {
	if (!matchingEvents.find(e => e.targets?.includes(iface))) {
	  console.warn("[reffy] Could not determine which event named " + eventName + " match EventHandler of " + iface + " interface in " + spec.title); 
	}
      }
    }
  }

  // Find definitions marked as of event type
  [...document.querySelectorAll('dfn[data-dfn-type="event"')].forEach(dfn => {
    const type = dfn.textContent.trim();
    const container = dfn.parentNode;
    const event = {type, interface: null, targets: fromEventElementToTargetInterfaces(dfn), src: { format: "dfn", href: href(dfn.closest("*[id]")) }, href: href(dfn) };
    // CSS Animations & Transitions uses dt/dd to describe events
    // and uses a ul in the dd to describe bubbling behavior
    let bubbles;
    if (container.tagName === "DT") {
      const bubbleItem = [...container.nextElementSibling.querySelectorAll("li")].find(li => li.textContent.startsWith("Bubbles:"));
      if (bubbleItem) {
	bubbles = !!bubbleItem.textContent.match(/yes/i);
      }
    }
    const ev = events.find(e => isSameEvent(event, e));
    if (!ev) {
      event.bubbles = bubbles;
      events.push(event);
      console.error("[reffy] No interface hint found for event definition " + event.type + " in " + spec.title);
    } else {
      if (bubbles !== undefined) {
	ev.bubbles = bubbles;
      }
    }
  });
  return events;
}
