import extractWebIdl from './extract-webidl.mjs';
import {parse} from "../../node_modules/webidl2/index.js";
/**
 * Extract definitions in the spec that follow the "Definitions data model":
 * https://tabatkins.github.io/bikeshed/#dfn-contract
 *
 * Each definition returned by the function will have the following properties:
 * - id: The local ID in the DOM. Should be unique within a spec page.
 * - href: The absolute URL to the definition.
 * - linkingText: List of linking phrases for references.
 * - localLinkingText: List of linking phrases for local references only.
 * - type: The definition type. One of the values in
 *     https://tabatkins.github.io/bikeshed/#dfn-types
 * - for: The list of namespaces for the definition
 * - access: "public" when definition can be referenced by other specifications,
 *     "private" when it should be viewed as a local definition.
 * - informative: true when definition appears in an informative section,
 *     false if it is normative
 * - heading: Heading under which the term is to be found. An object with "id",
 *     "title", and "number" properties
 * - definedIn: An indication of where the definition appears in the spec. Value
 *     can be one of "dt", "pre", "table", "heading", "note", "example", or
 *     "prose" (last one indicates that definition appears in the main body of
 *     the spec)
 *
 * @function
 * @public
 * @return {Array(Object)} An Array of definitions
*/

function definitionMapper(el, idToHeading) {
  function normalize(str) {
    return str.trim().replace(/\s+/g, ' ');
  }

  let definedIn = 'prose';
  const enclosingEl = el.closest('dt,pre,table,h1,h2,h3,h4,h5,h6,.note,.example') || el;
  switch (enclosingEl.nodeName) {
    case 'DT':
    case 'PRE':
    case 'TABLE':
      definedIn = enclosingEl.nodeName.toLowerCase();
      break;
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6':
      definedIn = 'heading';
      break;
    default:
      if (enclosingEl.classList.contains('note')) {
        definedIn = 'note';
      }
      else if (enclosingEl.classList.contains('example')) {
        definedIn = 'example';
      }
      break;
  }

  return {
    // ID is the id attribute
    id: el.getAttribute('id'),

    // Compute the absolute URL
    // (Note the crawler merges pages of a multi-page spec in the first page
    // to ease parsing logic, and we want to get back to the URL of the page)
    href: (_ => {
      const pageWrapper = el.closest('[data-reffy-page]');
      const url = new URL(pageWrapper ?
                          pageWrapper.getAttribute('data-reffy-page') : window.location.href);
      url.hash = '#' + el.getAttribute('id');
      return url.toString();
    })(),

    // Linking text is given by the data-lt attribute if present, or it is the
    // textual content
    linkingText: el.hasAttribute('data-lt') ?
      el.getAttribute('data-lt').split('|').map(normalize) :
      [normalize(el.textContent)],

    // Additional linking text can be defined for local references
    localLinkingText: el.getAttribute('data-local-lt') ?
      el.getAttribute('data-local-lt').split('|').map(normalize) :
      [],

    // Link type must be specified, or it is "dfn"
    type: el.getAttribute('data-dfn-type') || 'dfn',

    // Definition may be namespaced to other constructs. Note the list is not
    // purely comma-separated due to function parameters. For instance,
    // attribute value may be "method(foo,bar), method()"
    for: el.getAttribute('data-dfn-for') ?
      el.getAttribute('data-dfn-for').split(/,(?![^\(]*\))/).map(normalize) :
      [],

    // Definition is public if explicitly marked as exportable or if export has
    // not been explicitly disallowed and its type is not "dfn"
    access: (el.hasAttribute('data-export') ||
             (!el.hasAttribute('data-noexport') &&
              el.hasAttribute('data-dfn-type') &&
              el.getAttribute('data-dfn-type') !== 'dfn')) ?
      'public' : 'private',

    // Whether the term is defined in a normative/informative section,
    // provided the wrapping section follows usual patterns:
    // https://github.com/w3c/respec/blob/develop/src/core/utils.js#L69
    // https://tabatkins.github.io/bikeshed/#metadata-informative-classes
    informative: !!el.closest([
      '.informative', '.note', '.issue', '.example', '.ednote', '.practice',
      '.introductory', '.non-normative'

    ].join(',')),

    // Heading under which the term is to be found
    heading: idToHeading[el.getAttribute('id')],

    // Enclosing element under which the definition appears. Value can be one of
    // "dt", "pre", "table", "heading", "note", "example", or "prose" (last one
    // indicates that definition appears in the main body of the specification)
    definedIn
  };
}

export default function (spec, idToHeading = {}) {
  const definitionsSelector = [
    // re data-lt, see https://github.com/w3c/reffy/issues/336#issuecomment-650339747
    'dfn[id]:not([data-lt=""])',
    'h2[id][data-dfn-type]:not([data-lt=""])',
    'h3[id][data-dfn-type]:not([data-lt=""])',
    'h4[id][data-dfn-type]:not([data-lt=""])',
    'h5[id][data-dfn-type]:not([data-lt=""])',
    'h6[id][data-dfn-type]:not([data-lt=""])'
  ].join(',');

  let extraDefinitions = [];
  switch (spec) {
  case "html":
    preProcessHTML();
    break;
  case "SVG2":
    preProcessSVG2();
    break;
  }

  return [...document.querySelectorAll(definitionsSelector)]
    .map(node => definitionMapper(node, idToHeading));
}

function preProcessHTML() {
  // We need to extract the list of possible interfaces by parsing the WebIDL of the spec first
  const idl = extractWebIdl();
  const idlTree = parse(idl);
  const idlInterfaces = idlTree.filter(item => item.type === "interface" || item.type === "interface mixin");

  function fromIdToElement(id) {
    switch(id) {
    case "hyperlink": return "a,area";
    case "mod": return "ins,del";
    case "dim": return "img,iframe,embed,object,video";
      // The spec lists img, but img doesn't have a form attribute
    case "fae": return "button,fieldset,input,object,output,select,textarea";
    case "fe": return "button,fieldset,input,object,output,select,textarea";
    case "fs": return "form,button";
    case "hx": return "h1,h2,h3,h4,h5,h6";
    case "tdth": return "td,th";
      // xml: attributes are id'd as xml-
      // case "xml": return "all HTML elements";
    case "xml": return undefined;

    };
    return id;
  }

  function fromIdToIdl(id) {
    const specialInterfaceIds = {
      "appcache": "ApplicationCache",
      "a": "HTMLAnchorElement",
      "caption": "HTMLTableCaptionElement",
      "colgroup": "HTMLTableColElement",
      "col": "HTMLTableColElement",
      "context-2d-canvas": "CanvasRenderingContext2D",
      // submittable elements https://html.spec.whatwg.org/multipage/forms.html#category-submit
      "cva": "HTMLButtonElement,HTMLInputElement,HTMLObjectElement,HTMLSelectElement,HTMLTextAreaElement",
      "dnd": "GlobalEventHandlers",
      "dim": "HTMLImageElement,HTMLIFrameElement,HTMLEmbedElement,HTMLObjectElement,HTMLVideoElement",
      "dir": "HTMLDirectoryElement",
      "dl": "HTMLDListElement",
      // form associated elements https://html.spec.whatwg.org/multipage/forms.html#form-associated-element
      // The spec lists img, but img doesn't have a form attribute
      "fae": "HTMLButtonElement,HTMLFieldsetElement,HTMLInputElement,HTMLObjectElement,HTMLOutputElement,HTMLSelectElement,HTMLTextAreaElement",
      // form  elements https://html.spec.whatwg.org/multipage/forms.html#category-listed
      "fe": "HTMLButtonElement,HTMLFieldsetElement,HTMLInputElement,HTMLSelectElement,HTMLTextAreaElement",
      // Form submission attributes https://html.spec.whatwg.org/multipage/form-control-infrastructure.html#form-submission-attributes
      // some are for button some for form
      "fs": "HTMLButtonElement,HTMLFormElement",
      "hx": "HTMLHeadingElement",
      "hyperlink": "HTMLHyperlinkElementUtils",
      "img": "HTMLImageElement",
      // Labelable form elements
      "lfe": "HTMLButtonElement,HTMLInputElement,HTMLMeterElement,HTMLOutputElement,HTMLProgressElement,HTMLSelectElement,HTMLTextAreaElement",
      "ol": "HTMLOListElement",
      "p": "HTMLParagraphElement",
      "tbody": "HTMLTableSectionElement",
      "td": "HTMLTableCellElement",
      "th": "HTMLTableCellElement",
      "tdth": "HTMLTableCellElement",
      "textarea/input": "HTMLTextAreaElement,HTMLInputElement",
      "tr": "HTMLTableRowElement",
      "tracklist": "AudioTrackList,VideoTrackList",
      "ul": "HTMLUListElement"
    };
    if (specialInterfaceIds[id]) {
      return specialInterfaceIds[id];
    }
    let iface = idlInterfaces.find(i => i.name.toLowerCase() === id || i.name.toLowerCase() === `html${id}element`);
    if (iface) {
      return iface.name;
    }
  }

  function fromIdToTypeAndFor(containerid, id) {
    // deals with exceptions to how containerid / id are expected to be parsed
    if (id) {
      [containerid, id] = {
        "history-scroll": ["history", "scrollrestoration"],
        // overloads
        "document-open" : ["document", "open"],
        "dedicatedworkerglobalscope-postmessage": ["dedicatedworkerglobalscope", "postmessage"],
        "messageport-postmessage": ["messageport", "postmessage"],
        "window-postmessage": ["window", "postmessage"],
        "worker-postmessage": ["worker", "postmessage"],
        "context-2d-settransform": ["context-2d", "settransform"]
      }[containerid] || [containerid, id];
    }


    const exceptions = {
      "worker-navigator": "WorkerGlobalScope",
      "navigator-canplaytype": "HTMLMediaElement",
      "media-getsvgdocument": "HTMLIFrameElement,HTMLEmbedElement,HTMLObjectElement",
      "fe-autofocus": "HTMLOrSVGElement"
    };

    let interfaces = [];
    const mixins = {
      "context-2d": "CanvasRenderingContext2D",
      "navigator": "Navigator"
    };
    const fullId = containerid + "-" + id;
    if (exceptions[fullId]) {
      let names = exceptions[fullId].split(",");
      interfaces = idlInterfaces.filter(i => names.includes(i.name));
    } else {
      if (fromIdToIdl(containerid)) {
        let names = fromIdToIdl(containerid).split(",");
        interfaces = idlInterfaces.filter(i => names.includes(i.name));
      }
      if (Object.keys(mixins).includes(containerid)) {
        // some container ids are split across several mixins, let's find out which
        const candidateInterfaceNames = [mixins[containerid]].concat(idlTree.filter(inc => inc.type === "includes" && inc.target === mixins[containerid]).map(inc => inc.includes));
        interfaces = candidateInterfaceNames.map(name => idlInterfaces.filter(iface => iface.name === name)).flat().filter(iface => iface && iface.members && iface.members.find(member => member.name.toLowerCase() === id));
      }
    }


    if (interfaces.length) {
      let type = "attribute";
      let relevantInterfaces = interfaces;
      if (id) {
        type = "dfn";
        // dom-head-profile, intentionally omitted from IDL fragment
        if (id === "profile" && containerid === "head") {
          return {type: "attribute", _for: "HTMLHeadElement"};
        }
        relevantInterfaces = interfaces.filter(iface => iface.members.find(member => member.name && member.name.toLowerCase() === id));
        if (relevantInterfaces.length) {
          let idlTerm = relevantInterfaces[0].members.find(member => member.name && member.name.toLowerCase() === id);
          type = idlTerm.type === "operation" ? "method" : idlTerm.type;
        }
      }
      return {type, _for: [... new Set(relevantInterfaces.map(iface => iface.name))].join(",")};
    }

    const enumName = id => {
      switch(id) {
      case "context-2d-direction": return "CanvasDirection";
      case "context-2d-fillrule": return "CanvasFillRule";
      case "context-2d-imagesmoothingquality": return "ImageSmoothingQuality";
      case "context-2d-textalign": return "CanvasTextAlign";
      case "context-2d-textbaseline": return "CanvasTextBaseline";
      }
    };

    let _enum = idlTree.find(i => i.type === "enum" && (i.name.toLowerCase() === containerid || enumName(containerid) === i.name));
    // TODO check the value is defined
    if (_enum) return {type: "enum-value", _for: _enum.name};
    let dict = idlTree.find(i => i.type === "dictionary" && i.name.toLowerCase() === containerid );
    // TODO check the field is defined
    if (dict) return {type: "dict-member", _for: dict.name};

    // Miscellaneous exceptions
    // Ideally, get this fixed upstream
    switch(containerid) {
      // not an enum, but a well-defined DOMString
    case "datatransfer-dropeffect": return {type: "dfn", _for: "DataTransfer.dropEffect"};
      // not an enum, but a well-defined DOMString
    case "datatransfer-effectallowed": return {type: "dfn", _for: "DataTransfer.effectAllowed"};
    case "document-nameditem": return {type: "dfn", _for: "Document"};
      // mode of the value attribute of the inputelement
    case "input-value":
    case "input-value-default":
      return {type: "dfn", _for: "HTMLInputElement.value"};
      // not an enum, but a well-defined DOMString
    case "texttrack-kind": return {type: "dfn", _for: "TextTrack.kind"};
      // dom-tree-accessors
    case "tree": return { type:"dfn", _for: ""};
    case "window-nameditem": return {type: "dfn", _for: "Window"};
    }

    //throw "Cannot match " + containerid + " to a known IDL name (" + id + ")";
    return {type: "dfn", _for: containerid +  " with " + id};
  }

  const headingSelector = [
    'h2[id]:not([data-dfn-type]) dfn:not([data-dfn-type])',
    'h3[id]:not([data-dfn-type]) dfn:not([data-dfn-type])',
    'h4[id]:not([data-dfn-type]) dfn:not([data-dfn-type])',
    'h5[id]:not([data-dfn-type]) dfn:not([data-dfn-type])',
    'h6[id]:not([data-dfn-type]) dfn:not([data-dfn-type])'
  ].join(',');

  // we copy the id on the dfn when it is set on the surrounding heading
  [...document.querySelectorAll(headingSelector)]
    .forEach(el => {
      const headingId = el.closest("h2, h3, h4, h5, h6").id;
      if (!el.id) {
        el.id = headingId;
      }
      if (headingId.match(/^the-([^-]*)-element$/)) {
        el.dataset.dfnType = 'element';
      }
    });

  const manualIgnore = ["dom-xsltprocessor-transformtofragment", "dom-xsltprocessor-transformtodocument"];

  // all the definitions in indices.html are non-normative, so we skip them
  // to avoid having to properly type them
  // they're not all that interesting
  [...document.querySelectorAll('section[data-reffy-page$="indices.html"] dfn[id]')].forEach(el => {
    el.dataset.dfnSkip = true;
  });

  [...document.querySelectorAll("dfn[id]:not([data-dfn-type]):not([data-skip])")]
    .forEach(el => {
      // Hard coded rules for special ids
      // hyphen in attribute name throws off other match rules
      if (el.id === "attr-form-accept-charset") {
        el.dataset.dfnType = 'element-attr';
        el.dataset.dfnFor = "form";
        return;
      }
      // dom-style is defined elsewhere
      if (el.id === "dom-style") {
        el.dataset.dfnType = 'attribute';
        el.dataset.dfnFor = 'HTMLElement';
        el.dataset.noexport = "";
        return;
      }
      // audio/menu in a heading with an id, throws off the "heading" convention
      if (el.id === "audio" || el.id === "menus") {
        el.dataset.dfnType = 'element';
        return;
      }

      // If there is a link, we assume this documents an imported definition
      // so we make it ignored by removing the id
      if (el.querySelector('a[href^="http"]')
          || manualIgnore.includes(el.id)
         ) {
        return;
      }
      let m;

      if (el.closest("code.idl")) {
        // we look if that matches a top-level idl name
        let idlTerm = idlTree.find(item => item.name === el.textContent);
        if (idlTerm) {
          // we split at space to cater for "interface mixin"
          el.dataset.dfnType = idlTerm.type.split(' ')[0];
          return;
        }
      }
      if ((m = el.id.match(/^attr-([^-]+)-([^-]+)$/))) {
        // e.g. attr-ul-type
        el.dataset.dfnType = 'element-attr';
        let _for = fromIdToElement(m[1]);
        // special casing usemap attribute
        if (m[1] === "hyperlink" && m[2] === "usemap") {
          _for = "img,object";
          return;
        }
        if (m[1] === "aria") {
          // reference to external defined elements, noexport
          el.dataset.noexport = true;
          return;
        }
        // "loading", "crossorigin", "autocapitalize" are used in middle position
        // when describing possible keywords
        if (["loading", "crossorigin", "autocapitalize"].includes(m[1])) {
          el.dataset.dfnType = 'dfn';
          // Not sure how to indicate this is for an attribute value
          // _for = m[1];
        }
        if (_for && !el.dataset.dfnFor) {
          el.dataset.dfnFor = _for;
        }
        return;
      }
      if ((m = el.id.match(/^attr-([^-]+)$/))) {
        el.dataset.dfnType = 'element-attr';
        // not sure how to encode "every html element"?
        // el.dataset.dfnFor = 'all HTML elements';
        return;
      }
      if ((m = el.id.match(/^handler-([^-]+)$/))) {
        const sharedEventHandlers = ["GlobalEventHandlers", "WindowEventHandlers", "DocumentAndElementEventHandlers"];
        el.dataset.dfnType = 'attribute';
        if (!el.dataset.dfnFor) {
          let _for = sharedEventHandlers.filter(iface => idlInterfaces.find(item => item.name === iface && item.members.find(member => member.name === m[1])))[0];
          if (_for) {
            el.dataset.dfnFor = _for;
          }
        }
        return;
      }

      if ((m = el.id.match(/^handler-([^-]+)-/))) {
        el.dataset.dfnType = 'attribute';
        el.dataset.dfnFor = el.dataset.dfnFor || fromIdToTypeAndFor(m[1])._for;
        return;
      }

      if ((m = el.id.match(/^selector-/))) {
        el.dataset.dfnType = 'selector';
        return;
      }

      if ((m = el.id.match(/^dom-([^-]+)$/) || el.id.match(/^dom-([^-]+)-[0-9]+$/) || el.id.match(/^dom-([^-]+)-constructor$/))) {
        const globalscopes = [
          "ElementContentEditable",
          "HTMLElement",
          "HTMLOrSVGElement",
          "Window",
          "WindowLocalStorage",
          "WindowOrWorkerGlobalScope",
          "WindowSessionStorage",
          "WorkerGlobalScope"
        ];
        const name = el.textContent.split('(')[0];
        if (el.textContent.match(/\(/)) {
          // e.g. print(), Audio(src)
          // starts with a capital letter => constructor
          if (name.match(/^[A-Z]/)) {
            let iface = idlTree.find(item => item.type === "interface" &&
                                     // regular constructor
                                     (item.name === name && item.members.find(member => member.type === "constructor")
                                      // LegacyFactoryFunction e.g. Audio()
                                      || item.extAttrs.find(ea => ea.name === "LegacyFactoryFunction" && ea.rhs.value === name)));
            if (iface) {
              el.dataset.dfnType = 'constructor';
              el.dataset.dfnFor = iface.name;
              return;
            }
          } else {
            // otherwise, a method of a global scope
            let opContainer = globalscopes.find(scope => idlTree.find(item => item.type.startsWith("interface") && item.name === scope && item.members.find(member => member.type === "operation" && member.name === name)));
            if (opContainer) {
              el.dataset.dfnType = 'method';
              el.dataset.dfnFor = opContainer;
              return;
            }
          }
        } else {
          // starts with a capital letter => interface
          if (name.match(/^[A-Z]/)) {
            let iface = idlTree.find(item => item.type === "interface" && item.name === name);
            if (iface) {
              el.dataset.dfnType = 'interface';
              return;
            }
          } else {
            // an attribute of a global scope
            let attrContainer = globalscopes.find(scope => idlTree.find(item => item.type.startsWith("interface") && item.name === scope && item.members.find(member => member.type === "attribute" && member.name === name)));
            if (attrContainer) {
              el.dataset.dfnType = 'attribute';
              el.dataset.dfnFor = attrContainer;
              return;
            }
          }
        }
        return;
      }

      if ((m = el.id.match(/^dom-(.+)-([^-]+)$/))) {
        const {type, _for} = fromIdToTypeAndFor(m[1], m[2])
        // Special casing all-caps constants
        if (m[2].match(/^[A-Z_]+$/)) type = "const";
        el.dataset.dfnType = type;
        el.dataset.dfnFor = el.dataset.dfnFor || _for;
        return;
      }

      if (m = el.id.match(/^event-([a-z]+)$/)) {
        if (!el.textContent.match(/ /)) {
          el.dataset.dfnType = 'event';
          return;
        }
      }

      if (m = el.id.match(/^event-([a-z]+)-(.*)$/)) {
        if (!el.textContent.match(/ /)) {
          if (m[1] === "media" && ["change", "addtrack", "removetrack"].includes(m[2])) {
            el.dataset.dfnFor = "AudioTrackList,VideoTrackList,TextTrackList";
          } else {
            el.dataset.dfnFor = fromIdToIdl(m[1]) || m[1];
          }
          el.dataset.dfnType = 'event';
          return;
        }
      }

    });
}

function preProcessSVG2() {
  const idl = extractWebIdl();
  const idlTree = parse(idl);
  const idlInterfaces = idlTree.filter(item => item.type === "interface" || item.type === "interface mixin");

  // the only element definition not properly marked up in the SVG spec
  const linkHeading = document.getElementById("LinkElement");
  if (linkHeading && !linkHeading.dataset.dfnType) {
    linkHeading.dataset.dfnType = "element";
    linkHeading.dataset.lt = "link";
  }

  [...document.querySelectorAll(".attrdef dfn[id]:not([data-dfn-type]):not([data-skip])")]
    .forEach(el => {
      el.dataset.dfnType = "element-attr";
      const attrDesc = document.querySelector('[data-reffy-page$="attindex.html"] th span.attr-name a[href$="#' + el.id + '"]');
      if (attrDesc) {
          el.dataset.dfnFor = attrDesc.closest('tr').querySelector('td').textContent;
      } else {
        console.error("Could not find description for " + el.textContent);
      }
    });
  [...document.querySelectorAll("dt[id] > .adef, dt[id] > .property")].forEach(el => {
    const dt = el.parentNode;
    const newdt = document.createElement("dt");
    const dfn = document.createElement("dfn");
    dfn.id = dt.id;
    dfn.dataset.dfnType = el.classList.contains("adef") ? "element-attr" : "property";
    const indexPage = el.classList.contains("adef") ? "attindex.html" : "propidx.html";
    const attrDesc = document.querySelector('[data-reffy-page$="' + indexPage + '"] th a[href$="#' + dfn.id + '"]');
    if (attrDesc) {
      // TODO: this doesn't deal with grouping of elements, e.g. "text content elements"
      dfn.dataset.dfnFor = [...attrDesc.closest('tr').querySelectorAll('span.element-name a')].map (n => n.textContent).join(',');
    } else {
      console.error("Could not find description for " + el.textContent + "/" + dfn.id);
    }
    dfn.textContent = el.textContent;
    newdt.appendChild(dfn);
    dt.replaceWith(newdt);
  });
  [...document.querySelectorAll('b[id^="__svg__"]')].forEach(el => {
    const [,, containername, membername] = el.id.split('__');
    if (containername && membername) {
      let container = idlTree.find(i => i.name === containername);
      if (container) {
        let member = container.members.find(m => m.name === membername);
        if (member) {
          const dfn = document.createElement("dfn");
          dfn.id = el.id;
          dfn.textContent = el.textContent;
          dfn.dataset.dfnFor = containername;
          dfn.dataset.dfnType = member.type === "operation" ? "method" : member.type;
          el.replaceWith(dfn);
        }
      }
    }
  });
  [...document.querySelectorAll('h3[id^="Interface"]:not([data-dfn-type])')].forEach(el => {
    const name = el.id.slice("Interface".length);
    if (idlTree.find(i => i.name === name && i.type === "interface")) {
      el.dataset.dfnType = "interface";
      el.dataset.lt = name;
    }
  });
  [...document.querySelectorAll('b[id]:not([data-dfn-type])')].forEach(el => {
    const name = el.textContent;
    const idlItem = idlTree.find(i => i.name === name) ;
    if (idlItem) {
      const dfn = document.createElement("dfn");
      dfn.id = el.id;
      dfn.dataset.dfnType = idlItem.type;
      dfn.textContent = el.textContent;
      el.replaceWith(dfn);
    }
  });

}
