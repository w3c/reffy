import extractWebIdl from './extract-webidl.mjs';
import informativeSelector from './informative-selector.mjs';
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

function normalize(str) {
  return str.trim().replace(/\s+/g, ' ');
}

// Valid types defined in https://tabatkins.github.io/bikeshed/#dfn-types
// (+ "namespace" and "event" which are not yet in the doc)
function hasValidType(el) {
  const validDfnTypes = [
    // CSS types
    'property',
    'descriptor',
    'value',
    'type',
    'at-rule',
    'function',
    'selector',

    // Web IDL types
    'namespace',
    'interface',
    'constructor',
    'method',
    'argument',
    'attribute',
    'callback',
    'dictionary',
    'dict-member',
    'enum',
    'enum-value',
    'exception',
    'const',
    'typedef',
    'stringifier',
    'serializer',
    'iterator',
    'maplike',
    'setlike',
    'extended-attribute',
    'event',

    // Element types
    'element',
    'element-state',
    'element-attr',
    'attr-value',


    // URL scheme
    'scheme',

    // HTTP header
    'http-header',

    // Grammar type
    'grammar',

    // "English" terms
    'abstract-op',
    'dfn'
  ];

  const type = el.getAttribute('data-dfn-type') ?? 'dfn';
  const isValid = validDfnTypes.includes(type);
  if (!isValid) {
    console.warn('[reffy]', `"${type}" is an invalid dfn type for "${normalize(el.textContent)}"`);
  }
  return isValid;
}


function definitionMapper(el, idToHeading) {
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

  // Compute the absolute URL with fragment
  // (Note the crawler merges pages of a multi-page spec in the first page
  // to ease parsing logic, and we want to get back to the URL of the page)
  const page = el.closest('[data-reffy-page]')?.getAttribute('data-reffy-page');
  const url = new URL(page ?? window.location.href);
  url.hash = '#' + el.getAttribute('id');
  const href = url.toString();

  return {
    // ID is the id attribute
    // (ID may not be unique in a multi-page spec)
    id: el.getAttribute('id'),

    // Absolute URL with fragment
    href,

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

    // Whether the term is defined in a normative/informative section
    informative: !!el.closest(informativeSelector),

    // Heading under which the term is to be found
    heading: idToHeading[href],

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
  const shortname = (typeof spec === 'string') ? spec : spec.shortname;
  switch (shortname) {
  case "html":
    preProcessHTML();
    break;
  case "ecmascript":
    preProcessEcmascript();
    break;
  case "SVG2":
    preProcessSVG2();
    break;
  }

  return [...document.querySelectorAll(definitionsSelector)]
    .map(node => {
      // 2021-06-21: Temporary preprocessing of invalid "idl" dfn type (used for
      // internal slots) while fix for https://github.com/w3c/respec/issues/3644
      // propagates to all EDs and /TR specs. To be dropped once crawls no
      // longer produce warnings.
      if (node.getAttribute('data-dfn-type') === 'idl') {
        const linkingText = node.hasAttribute('data-lt') ?
          node.getAttribute('data-lt').split('|').map(normalize) :
          [normalize(node.textContent)];
        node.setAttribute('data-dfn-type', linkingText[0].endsWith(')') ? 'method' : 'attribute');
        console.warn('[reffy]', `Fixed invalid "idl" dfn type "${normalize(node.textContent)}"`);
      }
      return node;
    })
    .filter(hasValidType)
    .map(node => definitionMapper(node, idToHeading));
}

function preProcessEcmascript() {
  const sectionFilter= ":not([legacy])";

  const wrapWithDfn = (el) => {
    // wrap with a dfn
    const dfn = document.createElement("dfn");
    for (let child of [...el.childNodes]) {
      dfn.appendChild(child);
    }
    el.appendChild(dfn);
    // set id
    dfn.setAttribute("id", el.parentNode.getAttribute("id"));
    dfn.dataset.ltNodefault = true;
    return dfn;
  };

  const cleanMethodName = (name) => {
    return name.replace(/\[/g, '')
      .replace(/\]/g, '') // removing brackets used to mark optional args
      .replace(/ \( */, '(')
      .replace(/ *\)/, ')')
      .replace(/ *,/g, ','); // trimming internal spaces
  };

  let definitionNames = new Set();

  const sectionNumberRegExp = /^([A-Z]\.)?[0-9\.]+ /;
  // any rule needs its exception
  const objectsIdsExceptions = ["sec-regexp-regular-expression-objects", "sec-weak-ref-objects"];
  [...document.querySelectorAll(`${sectionFilter} h1`)].
    forEach(el => {
      let dfnName = el.textContent.replace(sectionNumberRegExp, '').trim() ;// remove section number

      if (el.parentNode.id.match(/-objects?$/) && dfnName.match(/Object/)) {
        // only keep ids that match a credible pattern for object names
        if (!el.parentNode.id.match(/sec-[a-z]+-objects?/)
            // any rule needs its exception
            && !objectsIdsExceptions.includes(el.parentNode.id)
           ) return;
        const dfn = wrapWithDfn(el);
        // set data-lt
        dfn.dataset.lt = dfnName
          .replace(/^The /, '')
          .replace(/ Objects?$/, '')
        // regexp def includes "(Regular Expression)"
          .replace(/ \([^\)]*\)/, '') ;
        if (dfn.dataset.lt.match(/^[A-Z]/)) {
          // set dfn-type
          dfn.dataset.dfnType = "interface";
        }
      } else if (el.parentNode.id.match(/[-\.]prototype[-\.]/)) {
        // methods and attributes on objects

        // Skip headings with a space and no parenthesis
        // (they mention prototype but aren't a prototype property def)
        if (!dfnName.match(/\(/) && dfnName.match(/ /)) return;

        // Skip unscoped internal methods à la [[SetPrototypeOf]](V)
        if (dfnName.match(/\[\[/)) return;

        // Skip symbol-based property definitions;
        // not clear they're useful as externally referenceable names
        if (dfnName.match(/@@/)) return;

        const dfn = wrapWithDfn(el);
        // set definition scope
        dfn.dataset.dfnFor = dfnName.replace(/\.prototype\..*/, '')
          .replace(/^[gs]et /, ''); // remove "get"/"set" markers

        // Remove parent object prototype (set as scope)
        dfnName = dfnName.replace(/.*\.prototype\./, '');

        dfn.dataset.lt = dfnName;
        // set dfn-type
        if (dfn.dataset.lt.match(/\(/)) {
          dfnName = cleanMethodName(dfnName);
          dfn.dataset.lt = dfnName;
          dfn.dataset.dfnType = "method";
        } else {
          dfn.dataset.dfnType = "attribute";
        }
      } else {
        // We handle other headings that look like a method / property
        // on an object instance (rather than its prototype)
        // or an abstract op

        // if there is already a dfn element, we move on
        if (el.querySelector("dfn")) return;

        // only dealing with well-known patterns
        if (!dfnName.match(/^[a-z]+\.[a-z]+/i) // à la JSON.parse
            && !dfnName.match(/^([A-Z][a-z]+)+ *\(/) // à la ArrayCreate (
           ) return;
        // Skip symbol-based property definitions
        if (dfnName.match(/@@/)) return;

        // Skip headings where foo.bar appears as part of a longer phrase
        if (!dfnName.match(/\(/) && dfnName.match(/ /)) return;

        // redundant definitions of constructors on the global object
        // e.g. "Array ( . . . )"
        if (dfnName.match(/\. \. \./)) return;

        const dfn = wrapWithDfn(el);

        if (dfnName.match(/^[a-z]+\.[a-z]+/i)) {
          // set definition scope
          // This assumes that such methods and attributes are only defined
          // one-level deep from the global scope
          dfn.dataset.dfnFor = dfnName.replace(/\..*$/, '');
          // FIXME Math.hypot
          dfnName = dfnName.replace(dfn.dataset.dfnFor + ".", '');
          if (dfnName.match(/\(/)) {
            dfnName = cleanMethodName(dfnName);
            dfn.dataset.lt = dfnName;
            dfn.dataset.dfnType = "method";
          } else {
            dfn.dataset.lt = dfnName;
            dfn.dataset.dfnType = "attribute";
          }
        } else { // Abstract ops à la ArrayCreate or global constructor
          dfnName = cleanMethodName(dfnName);
          dfn.dataset.lt = dfnName;
          // distinguish global constructors from abstract operations
          if ((dfn.closest("emu-clause")?.parentNode?.id || "").match(/-constructors?$/)) {
            dfn.dataset.dfnType = "constructor";
          } else {
            dfn.dataset.dfnType = "abstract-op";
          }
        }
        definitionNames.add(dfnName);
      }
    });

  [...document.querySelectorAll(`${sectionFilter} dfn`)]
    .forEach(el => {
      // Skip definitions in conformance page and conventions page
      if (el.closest('section[data-reffy-page$="conformance.html"]') ||
         el.closest('section[data-reffy-page$="notational-conventions.html"]')) {
        return;
      }
      // If the <dfn> has no id, we attach it the one from the closest
      // <emu-clause> with an id
      // Note that this means several definitions can share the same id
      if (!el.getAttribute("id")) {
        if (el.closest("emu-clause[id]")) {
          el.setAttribute("id", el.closest("emu-clause").getAttribute("id"));
        }
      }
      // Mark well-known intrinsic objects as "interface",
      // for lack of a better type, and as the WebIDL spec has been doing
      if (el.textContent.match(/^%[A-Z].*%$/)) {
        el.dataset.dfnType = "interface";
      }
      // Mark well-known symbols as "const"
      // for lack of a better type, and as the WebIDL spec has been doing
      if (el.textContent.match(/^@@[a-z]*$/i)) {
        el.dataset.dfnType = "const";
      }
      // Any generic <dfn> that doesn't repeat a term defined with a type
      // is deemed to be exported
      if (!el.dataset.dfnType && !definitionNames.has(el.textContent)) {
        el.dataset.export = "";
      }
    });
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
