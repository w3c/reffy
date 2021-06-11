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
  const headingSelector = [
    'h2[id]:not([data-dfn-type]) dfn',
    'h3[id]:not([data-dfn-type]) dfn',
    'h4[id]:not([data-dfn-type]) dfn',
    'h5[id]:not([data-dfn-type]) dfn',
    'h6[id]:not([data-dfn-type]) dfn'
  ].join(',');

  // we copy the id on the dfn when it is set on the surrounding heading
  [...document.querySelectorAll(headingSelector)]
    .forEach(el => {
      const headingId = el.closest("h2, h3, h4, h5, h6").id;
      if (!el.id) {
        el.id = headingId;
      }
    });

  // all the definitions in indices.html are non-normative, so we skip them
  // to avoid having to properly type them
  // they're not all that interesting
  [...document.querySelectorAll('section[data-reffy-page$="indices.html"] dfn[id]')].forEach(el => {
    el.dataset.dfnSkip = true;
  });

  [...document.querySelectorAll("dfn[id]:not([data-dfn-type]):not([data-skip])")]
    .forEach(el => {
      // Hard coded rules for special ids
      // dom-style is defined elsewhere
      if (el.id === "dom-style") {
        el.dataset.dfnType = 'attribute';
        el.dataset.dfnFor = 'HTMLElement';
        el.dataset.noexport = "";
        return;
      }

      // If there is a link, we assume this documents an imported definition
      // so we make it ignored by removing the id
      if (el.querySelector('a[href^="http"]')) {
        return;
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
    const newDt = document.createElement("dt");
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
    newDt.appendChild(dfn);
    dt.replaceWith(newDt);
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
