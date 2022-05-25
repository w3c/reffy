import informativeSelector from './informative-selector.mjs';
import extractWebIdl from './extract-webidl.mjs';
import {parse} from "../../node_modules/webidl2/index.js";

const isSameEvent = (e1, e2) => e1.type === e2.type && e1.targets?.sort()?.join("|") === e2.targets?.sort()?.join("|");


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
    // TODO: if target is a mixin, point to the including interfaces?
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
      } else if (table.className === "event-definition") {
	// Format used e.g. in uievents
	const eventName = table.querySelector("tbody tr:first-child td:nth-child(2)")?.textContent.trim();
	let iface = table.querySelector("tbody tr:nth-child(2) td:nth-child(2)")?.textContent.trim();
	// Prose description, we skip it
	if (iface.match(/\s/)) {
	  iface = null;
	}
	let targets = table.querySelector("tbody tr:nth-child(5) td:nth-child(2)")?.textContent.split(",").map(t => t.trim());
	if (targets.find(t => t.match(/\s/))) {
	  // Prose description, skip it
	  targets = null;
	}
	if (eventName) {
	  events.push({type: eventName, interface: iface, targets});
	}
      }
    });
  }
  if (events.length === 0) {
    // Look for the DOM-suggested sentence "Fire an event named X"
    // or the Service Worker extension of "fire a functional event named"
    [...document.querySelectorAll("a")].filter(a => !a.closest(informativeSelector)
					       && (a.href === "https://dom.spec.whatwg.org/#concept-event-fire"
						   || a.href === "https://w3c.github.io/ServiceWorker/#fire-functional-event")
					      ).forEach(a => {
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
	  if (eventEl) {
	    // If the event being fired is from another spec, let's skip it
	    if (eventEl.tagName === "A" && eventEl.getAttribute("href").startsWith("https://")) return;
	    event.targets = fromEventElementToTargetInterfaces(eventEl);
	  }
	  // if we have already detected this combination, skip it
	  if (events.find(e => isSameEvent(event, e))) {
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

  // find events via IDL on<event> attributes with type EventHandler
  for (let eventName of Object.keys(handledEventNames)) {
    const matchingEvents = events.filter(e => e.type === eventName);
    if (matchingEvents.length === 0) {
      // We have not encountered such an event so far
      for (let iface of handledEventNames[eventName]) {
	events.push({type: eventName, targets: [iface.name], interface: null});
      }
    } else if (matchingEvents.length === 1) {
      // A single matching event, we assume all event handlers relate to it
      const [matchingEvent] = matchingEvents;
      // assign all interfaces at once if none is set
      // but don't add to existing interfaces otherwise
      if (!matchingEvent.targets) {
	matchingEvent.targets = handledEventNames[eventName];
      } else {
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
	if (!matchingEvents.find(e => e.targets.includes(iface))) {
	  console.warn("[reffy] Could not determine which event named " + eventName + " match EventHandler of " + iface + " interface in " + spec.title); 
	}
      }
    }
  }

  // Find definitions marked as of event type
  [...document.querySelectorAll('dfn[data-dfn-type="event"')].forEach(dfn => {
    const type = dfn.textContent.trim();
    const event = {type, interface: null, targets: fromEventElementToTargetInterfaces(dfn)};
    if (!events.find(e => isSameEvent(event, e))) {
      events.push();
      console.error("[reffy] No interface hint found for event definition " + event.type + " in " + spec.title);
    }
  });
  return events;
}
