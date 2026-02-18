import informativeSelector from './informative-selector.mjs';
import extractWebIdl from './extract-webidl.mjs';
import {parse} from "../../node_modules/webidl2/index.js";
import getAbsoluteUrl from './get-absolute-url.mjs';

const singlePage = !document.querySelector('[data-reffy-page]');
const href = el => el?.getAttribute("id") ? getAbsoluteUrl(el, {singlePage}) : null;


export default function (spec) {
  // Used to find eventhandler attributes
  let idlInterfaces = [];
  try {
    const idl = extractWebIdl();
    const idlTree = parse(idl);
    idlInterfaces = idlTree.filter(item =>
      item.type === "interface" ||
      item.type === "interface mixin");
  }
  catch {
    // Spec defines some invalid Web IDL, proceed without it
  }

  // associate event names from event handlers to interfaces with such an handler
  const handledEventNames = idlInterfaces
    .map(iface => iface.members
      .filter(m => m.idlType?.idlType === "EventHandler" && m.type === "attribute" && m.name?.startsWith("on"))
      .map(m => [m.name.slice(2), iface.name]))
    .flat()
    .reduce((acc, b) => {
      if (!acc[b[0]]) acc[b[0]] = [];
      acc[b[0]].push(b[1]);
      return acc;
    }, {});

  // Return true if the second event object describes the same event as the
  // first one. Note event types defined in event tables typically complete
  // event definitions for which we don't have any target information.
  function isSameEvent(e1, e2) {
    const res = e1.type === e2.type &&
      ((e1.href && e1.href === e2.href ) ||
        (e1.targets?.sort()?.join("|") === e2.targets?.sort()?.join("|")) ||
        (e2.src.format === 'event table'));
    if (res && e1.cancelable !== undefined && e2.cancelable !== undefined && e1.cancelable !== e2.cancelable) {
      console.error(`[reffy] Found two occurrences of same event with different "cancelable" properties in ${spec.title}: type=${e1.type} targets=${e1.targets.join(', ')} href=${e1.href}`);
    }
    return res;
  }

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
        console.error(`[reffy] Multiple event handler named ${eventEl.textContent}, cannot associate reliably to an interface in ${spec.title}`);
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
      if (firstHeading?.match(/^Event/) && firstHeading !== "Event handler") {
        hasStructuredData = true;
        // Useful e.g. for pointerevents
        const bubblingInfoColumn = [...table.querySelectorAll("thead th")]
          .findIndex(n => n.textContent.trim().match(/^bubbl/i));
        const cancelableInfoColumn = [...table.querySelectorAll("thead th")]
          .findIndex(n => n.textContent.trim().match(/^cancel/i));
        const interfaceColumn = [...table.querySelectorAll("thead th")]
          .findIndex(n => n.textContent.trim().match(/^(dom )?interface/i));
        const targetsColumn = [...table.querySelectorAll("thead th")]
          .findIndex(n => n.textContent.trim().match(/target/i));

        table.querySelectorAll("tbody tr").forEach(tr => {
          const event = {};
          // clean up possible MDN annotations
          // but keeping the original to swap it back in after processing
          // to leave the DOM intact for other processing scripts
          // (we need the clean up node in-tree to compute the proper href)
          const origEventEl = tr.querySelector("*:first-child");
          const eventEl = origEventEl.cloneNode(true);
          origEventEl.replaceWith(eventEl);
          const annotations = eventEl.querySelectorAll("aside, .mdn-anno");
          annotations.forEach(n => n.remove());

          let el = eventEl.querySelector("dfn,a");
          if (!el) {
            el = eventEl.querySelector("code");
          }
          if (!el) {
            eventEl.replaceWith(origEventEl);
            return;
          }
          if (el.tagName === "DFN" && el.id) {
            event.href = href(el);
          } else if (el.tagName === "A") {
            if (!el.getAttribute("href").startsWith("https://")) {
              const url = new URL(el.href);
                    event.href = href(document.getElementById(url.hash.slice(1)));
            } else {
              event.href = el.href;
            }
          }
          event.src = { format: "summary table", href: href(el.closest('*[id]')) };
          event.type = eventEl.textContent.trim();
          event.targets = fromEventElementToTargetInterfaces(eventEl.querySelector("dfn,a[href^='#']"));
          if (bubblingInfoColumn >= 0) {
            event.bubbles = tr.querySelector(`td:nth-child(${bubblingInfoColumn + 1})`)?.textContent?.trim() === "Yes";
          }
          if (cancelableInfoColumn >= 0) {
            event.cancelable = !!tr.querySelector(`td:nth-child(${cancelableInfoColumn + 1})`)?.textContent?.trim().match(/(yes)|✓|(varies)/i);
          }
          if (interfaceColumn >= 0) {
            event.interface =
              tr.querySelector(`td:nth-child(${interfaceColumn + 1}) a`)?.textContent ??
              tr.querySelector(`td:nth-child(${interfaceColumn + 1}) code`)?.textContent;
          }
          if (targetsColumn >= 0 && !event.targets) {
            event.targets = tr.querySelector(`td:nth-child(${targetsColumn + 1})`)?.textContent?.split(',').map(t => t.trim());
          }
          events.push(event);
          eventEl.replaceWith(origEventEl);
        });
      } else if (table.className === "def") {
        // Used in https://drafts.csswg.org/css-nav-1/
        const rowHeadings = [...table.querySelectorAll("tbody th")];
        if (!rowHeadings.find(th => th.textContent.trim() === "Bubbles")) {
          return;
        }
        const eventTypeRow = [...table.querySelectorAll("tbody th")].findIndex(n => n.textContent.trim().match(/^type/i));
        const bubblingInfoRow = [...table.querySelectorAll("tbody th")].findIndex(n => n.textContent.trim() === "Bubbles");
        const cancelableInfoRow = [...table.querySelectorAll("tbody th")].findIndex(n => n.textContent.trim() === "Cancelable");
        const interfaceRow = [...table.querySelectorAll("tbody th")].findIndex(n => n.textContent.trim().match(/^interface/i));
        const eventName = table.querySelector(`tr:nth-child(${eventTypeRow + 1}) td:nth-child(2)`)?.textContent?.trim();
        const bubblesCell = table.querySelector(`tr:nth-child(${bubblingInfoRow + 1}) td:nth-child(2)`);
        const bubbles = bubblesCell ? bubblesCell.textContent.trim() === "Yes" : null;
        const cancelableCell = table.querySelector(`tr:nth-child(${cancelableInfoRow + 1}) td:nth-child(2)`);
        const cancelable = cancelableCell ? cancelableCell.textContent.trim() === "Yes" : null;
        const iface = table.querySelector(`tr:nth-child(${interfaceRow + 1}) td:nth-child(2)`)?.textContent?.trim();
        if (eventName) {
          events.push({
            type: eventName, interface: iface, bubbles, cancelable,
            src: { format: "css definition table", href: href(table.closest('*[id]')) },
            href: href(table.closest('*[id]')) });
        }
      }
    });
  }

  // Look for definitions in event-definition tables
  // (used in Pointer Events and UI Events)
  [...document.querySelectorAll('table.event-definition')].forEach(table => {
    const properties = [...table.querySelectorAll('tr')]
      .map(line => {
        const nameEl = line.querySelector('th');
        const valueEl = line.querySelector('td');
        if (!nameEl || !valueEl) {
          return null;
        }
        let name = nameEl.textContent.trim().toLowerCase();
        let value = valueEl.textContent.trim();
        if (name === 'trusted targets') {
          name = 'targets';
          value = value.split(',').map(v => v.trim());
        }
        if (['type', 'interface', 'targets'].includes(name)) {
          return { name, value };
        }
        else if (['bubbles', 'cancelable'].includes(name)) {
          return { name, value: value.toLowerCase() === 'yes' ? true : false };
        }
        else {
          return null;
        }
      })
      .filter(prop => !!prop);
    const event = {};
    for (const prop of properties) {
      event[prop.name] = prop.value;
    }
    event.src = {
      format: 'event table',
      href: href(table.closest('*[id]'))
    };
    // Prefer summary table to definition in an event table if both exist
    // because the latter may include prose around the interface and target
    // names that make it harder to extract meaningful values.
    if (!events.find(e => isSameEvent(e, event))) {
      events.push(event);
    }
  });

  // Look for the DOM-suggested sentence "Fire an event named X"
  // or the Service Worker extension of "fire (a) functional event named"
  const isFiringLink = a => a.href === "https://dom.spec.whatwg.org/#concept-event-fire" ||
          a.href === "https://w3c.github.io/ServiceWorker/#fire-functional-event" ||
          a.href === "https://www.w3.org/TR/service-workers-1/#fire-functional-event-algorithm" ||
          a.href === "https://www.w3.org/TR/service-workers-1/#fire-functional-event" ||
          a.href === "https://www.w3.org/TR/service-workers/#fire-functional-event-algorithm" ||
          a.href === "https://www.w3.org/TR/service-workers/#fire-functional-event" ||
        a.href === "https://w3c.github.io/pointerevents/#dfn-fire-a-pointer-event";
  [...document.querySelectorAll("a")]
    .filter(a => !a.closest(informativeSelector) && isFiringLink(a))
    .forEach(a => {
      // Clone and drop possible annotations to avoid extracting asides.
      // (note the need to temporarily add the cloned node to the document
      // so that ranges can be used)
      const apos = [...a.parentNode.children].findIndex(c => c === a);
      const container = a.parentNode.cloneNode(true);
      const aclone = container.children[apos];

      const annotations = container.querySelectorAll("aside, .mdn-anno");
      annotations.forEach(n => n.remove());
      document.body.appendChild(container);


      // There can be multiple "fire an event" links in a container,
      // limiting our text parsing to content in between two such links,
      // or to the first time aside appears (no whitespaces in Bikeshed
      // so code would extract the beginning of the annotation otherwise),
      // or the end of the container if neither of the above occurs.
      const range = document.createRange();
      range.selectNode(container);
      range.setStart(aclone, 0);

      let nextFiringEl, curEl = aclone;
      while ((curEl = curEl.nextElementSibling)) {
        if (curEl.tagName === "A" && isFiringLink(curEl)) {
          nextFiringEl = curEl;
          break;
        }
      }

      if (nextFiringEl) {
        range.setEndBefore(nextFiringEl);
      }
      const parsedText = range.toString();
      document.body.removeChild(container);
      let phrasing;
      let m = parsedText.match(/fir(e|ing)\s+a(n|\s+pointer)\s+event\s+named\s+"?(?<eventName>[a-z]+)/i);
      if (m) {
        if (m[2] === "n") {
          phrasing = "fire an event";
        } else {
          phrasing = "fire a pointer event";
        }
      } else {
        m = parsedText.match(/fir(e|ing)\sa?\s*functional\s+event\s+((named|given)\s+)?"?(?<eventName>[a-z]+)/i);
        if (m) {
          phrasing = "fire functional event";
        }
      }

      if (phrasing) {
        const name = m.groups.eventName;
        let newEvent = true;
        let event = {
          src: { format: "fire an event phrasing", href: href(a.closest('*[id]')) },
          href: href(a.closest('*[id]'))
        };
        // this matches "fire an event named eventName" in battery-status and
        // media capture main, named type in fullscreen, named e, event in html
        // name in notifications API
        if (name === 'eventName' || name === 'type' || name === 'e' || name === 'event' || name === 'name') {
          return;
        } else {
          event.type = name;
          // looking at the element following the link
          // if its content match the name of the event
          const eventEl = a.nextElementSibling?.textContent?.trim() === event.type ? a.nextElementSibling.querySelector("a,dfn") || a.nextElementSibling : null;
          if (eventEl) {
            if (eventEl.tagName === "A" && eventEl.getAttribute("href")) {
              // use the target of the link as our href
              event.href = eventEl.href;
            } else if (eventEl.tagName === "DFN" && eventEl.id) {
              event.href = href(eventEl);
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
          let curEl = aclone, iface;
          while ((curEl = curEl.nextElementSibling) && curEl !== nextFiringEl) {
            if (curEl.textContent.match(/^([A-Z]+[a-z0-9]*)+Event$/)) {
              iface = curEl.textContent.trim();
              break;
            }
          }
          if (iface) {
            event.interface = iface;
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
        if (event.bubbles === undefined && event.cancelable === undefined) {
          if (parsedText.match(/bubbles and cancelable attributes/)) {
            if (parsedText.match(/true/)) {
              event.bubbles = true;
              event.cancelable = true;
            } else if (parsedText.match(/false/)) {
              event.bubbles = false;
              event.cancelable = false;
            }
          }
        }
        if (event.bubbles === undefined) {
          if (parsedText.match(/bubbles attribute/)) {
            if (parsedText.match(/true/)) {
              event.bubbles = true;
            } else if (parsedText.match(/false/)) {
              event.bubbles = false;
            }
          } else if (parsedText.match(/bubbles/) || parsedText.match(/bubbling/)) {
            event.bubbles = true;
          } else if (parsedText.match(/not bubble/)) {
            event.bubbles = false;
          }
        }
        if (event.cancelable === undefined) {
          if (parsedText.match(/cancelable attribute/)) {
            if (parsedText.match(/true/)) {
              event.cancelable = true;
            } else if (parsedText.match(/false/)) {
              event.cancelable = false;
            }
          } else if (parsedText.match(/not cancelable/) || parsedText.match(/not be cancelable/)) {
            event.cancelable = false;
          } else if (parsedText.match(/cancelable/)) {
            event.cancelable = true;
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
        events.push({
          type: eventName, targets: [iface], interface: null,
          src: { format: "IDL eventHandler", href: href(document.body) } }); // FIXME: find id of the IDL fragment
      }
    } else if (matchingEvents.length === 1) {
      // A single matching event, we assume all event handlers relate to it
      const [matchingEvent] = matchingEvents;
      // assign all interfaces at once if none is set
      // but don't add to existing interfaces otherwise
      if (!matchingEvent.targets) {
        matchingEvent.targets = handledEventNames[eventName];
      } else if (!hasStructuredData) {
        const missingIface = handledEventNames[eventName]
          .find(iface => !matchingEvent.targets.includes(iface));
        if (missingIface) {
          console.warn(`[reffy] More event handlers matching name ${eventName}, e.g. on ${missingIface} than ones identified in spec definitions`);
        }
      }
    } else {
      // More than one event with that name
      // we can only check if this matches known information
      // to warn of the gap otherwise
      for (let iface of handledEventNames[eventName]) {
        if (!matchingEvents.find(e => e.targets?.includes(iface))) {
          console.warn(`[reffy] Could not determine which event named ${eventName} match EventHandler of ${iface} interface in ${spec.title}`);
        }
      }
    }
  }

  // Find definitions marked as of event type
  [...document.querySelectorAll('dfn[data-dfn-type="event"')].forEach(dfn => {
    const type = dfn.textContent.trim();
    const container = dfn.parentNode;
    const event = {
      type, interface: null, targets: fromEventElementToTargetInterfaces(dfn),
      src: { format: "dfn", href: href(dfn.closest("*[id]")) },
      href: href(dfn)
    };
    // CSS Animations & Transitions uses dt/dd to describe events
    // and uses a ul in the dd to describe bubbling behavior
    let bubbles, iface, cancelable;
    if (container.tagName === "DT") {
      const bubbleItem = [...container.nextElementSibling.querySelectorAll("li")]
        .find(li => li.textContent.startsWith("Bubbles:"));
      if (bubbleItem) {
        bubbles = !!bubbleItem.textContent.match(/yes/i);
      }
      const cancelableItem = [...container.nextElementSibling.querySelectorAll("li")]
        .find(li => li.textContent.startsWith("Cancelable:"));
      if (cancelableItem) {
        cancelable = !!cancelableItem.textContent.match(/yes/i);
      }
      // CSS Animation & Transitions document the event in the heading
      // of the section where the definitions are located
      let currentEl = container.parentNode;
      while(currentEl) {
        if (currentEl.tagName.match(/^H[1-6]$/)) {
          break;
        }
        currentEl = currentEl.previousElementSibling;
      }
      const interfaceEl = currentEl?.querySelector("code");
      if (interfaceEl?.textContent?.match(/^[A-Z][a-z]+Event$/)) {
        iface = interfaceEl.textContent;
      }
    }
    const ev = events.find(e => isSameEvent(event, e));
    if (!ev) {
      if (iface) {
        event.interface = iface;
      }
      event.bubbles = bubbles;
      event.cancelable = cancelable;
      events.push(event);
      if (!iface) {
        console.error(`[reffy] No interface hint found for event definition ${event.type} in ${spec.title}`);
      }
    } else {
      if (iface) {
        ev.interface = iface;
      }
      if (!ev.href && event.href) {
        ev.href = event.href;
      }
      if (bubbles !== undefined) {
        ev.bubbles = bubbles;
      }
      if (cancelable !== undefined) {
        ev.cancelable = cancelable;
      }
    }
  });

  return events
    .map(e => {
      // Drop null properties (mandated by the schema for event extracts)
      if (e.hasOwnProperty('interface') && !e.interface) {
        delete e.interface;
      }
      if (e.hasOwnProperty('href') && !e.href) {
        delete e.href;
      }
      if (e.src && e.src.hasOwnProperty('href') && !e.src.href) {
        delete e.src.href;
      }
      return e;
    })
    .map(e => e.href && !e.href.startsWith(window.location.toString()) ?
      Object.assign(e, {isExtension: true}) :
      e) ;
}
