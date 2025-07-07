import extractWebIdl from './extract-webidl.mjs';
import informativeSelector from './informative-selector.mjs';
import getAbsoluteUrl from './get-absolute-url.mjs';
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
 * The extraction ignores definitions with an unknown type. A warning is issued
 * to the console when that happens.
 *
 * The extraction uses the first definition it finds when it bumps into a term
 * that is defined more than once (same "linkingText", same "type", same "for").
 * A warning is issued to the console when that happens.
 *
 * @function
 * @public
 * @return {Array(Object)} An Array of definitions
*/

import cloneAndClean from './clone-and-clean.mjs';

function normalize(str) {
  return str.trim().replace(/\s+/g, ' ');
}

// Valid types defined in https://tabatkins.github.io/bikeshed/#dfn-types
// (+ "namespace", "event" and "permission" which are not yet in the doc)
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
    'permission',

    // Element types
    'element',
    'element-state',
    'element-attr',
    'attr-value',

    // CDDL types
    'cddl-module',
    'cddl-type',
    'cddl-parameter',
    'cddl-key',
    'cddl-value',

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

// Return true when exported definition is not already defined in the list,
// Return false and issue a warning when it is already defined.
function isNotAlreadyExported(dfn, idx, list) {
  const first = list.find(d => d === dfn ||
      (d.access === 'public' && dfn.access === 'public' &&
      d.type === dfn.type &&
      d.linkingText.length === dfn.linkingText.length &&
      d.linkingText.every(lt => dfn.linkingText.find(t => t == lt)) &&
      d.for.length === dfn.for.length &&
      d.for.every(lt => dfn.for.find(t => t === lt))));
  if (first !== dfn) {
    console.warn('[reffy]', `Duplicate dfn found for "${dfn.linkingText[0]}", type="${dfn.type}", for="${dfn.for[0]}", dupl=${dfn.href}, first=${first.href}`);
  }
  return first === dfn;
}

// Extract the element's inner HTML content, removing any complex structure,
// so that the result can be injected elsewhere without creating problems.
function getHtmlProseDefinition(proseEl) {
  // Strip element of all annotations
  proseEl = cloneAndClean(proseEl);

  // Keep simple grouping content and text-level semantics elements
  const keepSelector = [
    'blockquote', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'hr', 'li',
    'ol', 'p', 'pre', 'ul',
    'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'dfn', 'em',
    'i', 'kbd', 'mark', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'span',
    'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr'
  ].join(',');
  let el;
  while (el = proseEl.querySelector(`:not(${keepSelector})`)) {
    // The content is more complex than anticipated. It may be worth checking
    // the definition to assess whether the extraction logic needs to become
    // smarter. For lack of a better reporting mechanism for now, let's record
    // a warning.
    console.warn('[reffy]', `Unexpected element "${el.nodeName}" found in textual definition of "${proseEl.getAttribute('data-defines')}"`);
    el.remove();
  }

  // Drop all attributes except "href", "dir", "lang" and "title"
  // For "href", let's make sure that we have an absolute URL
  [...proseEl.querySelectorAll('*')].forEach(el => {
    el.getAttributeNames().forEach(attr => {
      if (attr === 'href') {
        const page = el.closest('[data-reffy-page]')?.getAttribute('data-reffy-page');
        const url = new URL(el.getAttribute('href'), page ?? window.location.href);
        el.setAttribute('href', url.toString());
      }
      else if (!['dir', 'lang', 'title'].includes(attr)) {
        el.removeAttribute(attr);
      }
    });
  });

  return proseEl.innerHTML.trim();
}

function definitionMapper(el, idToHeading, usesDfnDataModel) {
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

  // Linking text is given by the data-lt attribute if present, or it is the
  // textual content... but we'll skip section numbers that might have been
  // captured when definition is defined in a heading, as in:
  // https://www.w3.org/TR/ethical-web-principles/#oneweb
  let linkingText = [];
  if (el.hasAttribute('data-lt')) {
    linkingText = el.getAttribute('data-lt').split('|').map(normalize);
  }
  else if (el.querySelector('.secno')) {
    const copy = el.cloneNode(true);
    const secno = copy.querySelector('.secno');
    secno.remove();
    linkingText = [normalize(copy.textContent)];
  }
  else {
    linkingText = [normalize(el.textContent)];
  }

  // Compute the absolute URL with fragment
  // (Note the crawler merges pages of a multi-page spec in the first page
  // to ease parsing logic, and we want to get back to the URL of the page)
  const page = el.closest('[data-reffy-page]')?.getAttribute('data-reffy-page');
  const url = new URL(page ?? window.location.href);
  url.hash = '#' + encodeURIComponent(el.getAttribute('id'));
  const href = url.toString();

  const dfn = {
    // ID is the id attribute
    // (ID may not be unique in a multi-page spec)
    id: el.getAttribute('id'),

    // Absolute URL with fragment
    href,

    // Linking text
    linkingText,

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
    // not been explicitly disallowed and its type is not "dfn" or a CDDL type,
    // or if the spec is an old spec that does not use the "data-dfn-type"
    // convention.
    access: (!usesDfnDataModel ||
             el.hasAttribute('data-export') ||
             (!el.hasAttribute('data-noexport') &&
              el.hasAttribute('data-dfn-type') &&
              el.getAttribute('data-dfn-type') !== 'dfn' &&
              !el.getAttribute('data-dfn-type').startsWith('cddl-'))) ?
      'public' : 'private',

    // Whether the term is defined in a normative/informative section
    informative: !!el.closest(informativeSelector),

    // Heading under which the term is to be found,
    // Defaults to the page or document URL and the spec's title
    heading: idToHeading[href] ?? {
      href: (new URL(page ?? window.location.href)).toString(),
      title: document.title
    },

    // Enclosing element under which the definition appears. Value can be one of
    // "dt", "pre", "table", "heading", "note", "example", or "prose" (last one
    // indicates that definition appears in the main body of the specification)
    definedIn
  };

  // Extract a prose definition in HTML for the term, if available
  const proseEl = document.querySelector(`[data-defines="#${dfn.id}"]`);
  if (proseEl) {
    const htmlProse = getHtmlProseDefinition(proseEl);
    if (htmlProse) {
      dfn.htmlProse = htmlProse;
    }
  }

  return dfn;
}

export default function (spec, idToHeading = {}) {
  const definitionsSelector = [
    // re data-lt, see https://github.com/w3c/reffy/issues/336#issuecomment-650339747
    // As for `<dfn>` we'll consider that headings without a `data-dfn-type`
    // have an implicit `"data-dfn-type"="dfn"` attribute, provided they also
    // have some other definition related attribute (because we only want to
    // extract headings that want to be seen as definitions)
    'dfn[id]:not([data-lt=""])',
    ':is(h2,h3,h4,h5,h6)[id]:is([data-dfn-type],[data-dfn-for],[data-export],[data-noexport],[data-lt]):not([data-lt=""])'
  ].join(',');

  const shortname = (typeof spec === 'string') ? spec : spec.shortname;
  switch (shortname) {
  case "CSS2":
    preProcessCSS2();
    break;
  case "html":
    preProcessHTML();
    break;
  case "ecmascript":
    preProcessEcmascript();
    break;
  case "SVG2":
    preProcessSVG2();
    break;
  case "rfc8610":
    // RFC8610 defines CDDL
    preProcessRFC8610();
    break;
  }

  const dfnEls = [...document.querySelectorAll(definitionsSelector)];
  const usesDfnDataModel = dfnEls.some(dfn =>
    dfn.hasAttribute('data-dfn-type') ||
    dfn.hasAttribute('data-dfn-for') ||
    dfn.hasAttribute('data-export') ||
    dfn.hasAttribute('data-noexport'));

  const definitions = dfnEls
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
    // Exclude IDL terms defined in a block that is flagged as to be excluded
    // or inside a <del>
    .filter(node => !node.closest('.exclude,del'))
    // When the whole term links to an external spec, the definition is an
    // imported definition. Such definitions are not "real" definitions, let's
    // skip them.
    // One hardcoded exception-to-the-rule, see:
    // https://github.com/w3c/webref/issues/882
    // (pending a proper dfns curation process, see:
    // https://github.com/w3c/webref/issues/789)
    .filter(node => {
      const link =
        node.querySelector('a[href^="http"]') ??
        node.closest('a[href^="http"]');
      return !link ||
        (node.textContent.trim() !== link.textContent.trim()) ||
        (link.href === 'https://www.w3.org/TR/CSS2/syndata.html#vendor-keywords');
    })
    .map(node => definitionMapper(node, idToHeading, usesDfnDataModel))
    .filter(isNotAlreadyExported);

  // Some specs have informative "For web developers" sections that provide
  // better anchors for web developers for a number of concepts. These anchors
  // are not proper definitions (and are references to terms defined elsewhere)
  // but they are useful for documentation purpose. To expose them to
  // documentation tools without duplicating terms in the cross-references
  // database, we'll use dedicated definition types to namespace them.
  // Note: Ideally, `.domintro` would be added to the informative selector list
  // but some specs use `.domintro` for lists that define IDL terms. We'll get
  // rid of them by skipping lists that have `dfn`.
  const devSelector = '.domintro dt:not(dt:has(dfn)) a[id]';
  const devDefinitions = [...document.querySelectorAll(devSelector)]
    .map(node => {
      const dfn = definitionMapper(node, idToHeading, usesDfnDataModel);
      const href = getAbsoluteUrl(node, { attribute: 'href' });
      const baseDfn = definitions.find(d => d.href === href);
      if (!baseDfn) {
        // When an interface inherits from another, the reference may target
        // a base dfn in another spec. For example:
        // https://encoding.spec.whatwg.org/#ref-for-dom-generictransformstream-readable
        // ... targets the Streams spec. There aren't many occurrences of this
        // pattern and the occurrences do not look super interesting to link to
        // from a documentation perspective. Let's skip them.
        console.warn('[reffy]', `Dev dfn ${node.textContent} (${node.id}) targets unknown dfn at ${node.href}`);
        return null;
      }
      if (!dfn.type.startsWith('dev-')) {
        dfn.type = 'dev-' + baseDfn.type;
      }
      dfn.linkingText = baseDfn.linkingText;
      dfn.localLinkingText = baseDfn.localLinkingText;
      dfn.access = baseDfn.access;
      dfn.for = baseDfn.for;
      dfn.informative = true;
      return dfn;
    })
    .filter(dfn => !!dfn);

  definitions.push(...devDefinitions);
  return definitions;
}

function preProcessEcmascript() {
  // Skip elements in sections marked as legacy
  const legacySectionFilter = n => !n.closest("[legacy]");

  const wrapWithDfn = (el) => {
    // wrap with a dfn
    const dfn = document.createElement("dfn");
    for (let child of [...el.childNodes]) {
      dfn.appendChild(child);
    }
    el.appendChild(dfn);
    // set id
    dfn.setAttribute("id", el.parentNode.getAttribute("id"));
    if (el.parentNode.hasAttribute("aoid")) {
      dfn.setAttribute("aoid", el.parentNode.getAttribute("aoid"));
    }
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
  let idlTypes = {};

  // We find the list of abstract methods
  // to help with scoping abstract operations
  let abstractMethods = {};
  const abstractMethodCaptions = [...document.querySelectorAll("figcaption")]
        .filter(el => el.textContent.match(/(abstract|additional) method/i) && el.parentNode.querySelector("emu-xref"));
  for (const figcaption of abstractMethodCaptions) {
    let scope = figcaption.querySelector("emu-xref").textContent;
    if (scope.endsWith('Environment Records')) {
      // Environment records come with an abstract class, and subclasses:
      // https://tc39.es/ecma262/multipage/executable-code-and-execution-contexts.html#sec-environment-records
      // Methods are defined for each class. We pretend that the scope is the
      // abstract class for now. Exact scope will be determined by looking at
      // the title of the section under which the method is found.
      scope = 'Environment Records';
    }
    const table = figcaption.parentNode.querySelector("tbody");
    for (const td of table.querySelectorAll("tr td:first-child")) {
      // We only consider the name of the method, not the potential parameters
      // as they're not necessarily consistently named across
      // the list and the definition
      const methodName = td.textContent.split('(')[0].trim();
      abstractMethods[methodName] = scope;
    }
  }

  // Regular expression used to drop section numbers from section titles
  const sectionNumberRegExp = /^([A-Z]\.)?[0-9\.]+ /;

  // Regular expression that matches scoped methods à la "JSON.parse"
  const scopedNameRegExp = /^[a-z0-9]+\.[a-z0-9]+/i;

  // Regular expression that matches general unscoped method names à la
  // "ArrayCreate (", "ToInt32 (" or "decodeURI (". The expression also matches
  // constructors.
  const methodNameRegExp = /^([a-z0-9]+)+ *\(/i;

  // More specific regular expression that matches abstract operations methods
  // à la "ToInt32 (". Does not match "decodeURI (" for instance as it does not
  // start with an upper case character.
  const abstractOpRegExp = /^[A-Z][a-zA-Z0-9]+ *\(/;

  [...document.querySelectorAll("h1")]
    .filter(legacySectionFilter)
    .forEach(el => {
      let dfnName = el.textContent.replace(sectionNumberRegExp, '').trim() ;// remove section number
      const dfnId = el.parentNode.id;
      if (dfnId.match(/-objects?$/) && dfnName.match(/ Objects?$/)) {

        // Skip headings that look like object definitions, but aren't
        const notObjectIds = ["sec-global-object", "sec-fundamental-objects", "sec-waiterlist-objects"];
        if (notObjectIds.includes(dfnId)) return;

        // only keep ids that match a credible pattern for object names
        // i.e. a single word
        // there are exceptions to that simple rule
        // RegExp includes its expansion (regular expansion) in the id
        // WeakRef is translated into weak-ref in the id
        const objectsIdsExceptions = ["sec-regexp-regular-expression-objects", "sec-weak-ref-objects", "sec-aggregate-error-objects", "sec-finalization-registry-objects", "sec-async-function-objects"];

        if (!dfnId.match(/sec-[a-z]+-objects?/)
            && !objectsIdsExceptions.includes(dfnId)
           ) return;
        const dfn = wrapWithDfn(el);
        // set data-lt
        dfnName = dfnName
          .replace(/^The /, '')
          .replace(/ Objects?$/, '')
        // regexp def includes "(Regular Expression)"
          .replace(/ \([^\)]*\)/, '') ;
        dfn.dataset.lt = dfnName;

        // FIXME
        // These interfaces are also defined in WebIDL, which in general is
        // the prefered source for these terms
        // Because bikeshed does not yet support spec-specific imports,
        // we hide these terms as not exported
        // cf https://github.com/w3c/reffy/pull/732#issuecomment-925950287
        const exportExceptions = [ "Promise", "DataView", "ArrayBuffer" ];
        if (exportExceptions.includes(dfnName)) {
          dfn.dataset.noexport = "";
        }

        if (dfnName.match(/^[A-Z]/)) {
          // set dfn-type
          if (dfnName.match(/Error$/)) {
            dfn.dataset.dfnType = "exception";
          } else if (!el.parentNode.querySelector('[id$="constructor"]')) {
            // Objects without constructors match to the namespace type
            dfn.dataset.dfnType = "namespace";
          } else {
            dfn.dataset.dfnType = "interface";
          }
          // We keep track of types associated with a name
          // to associate the same type to the relevant intrinsic object
          // à la %Math%
          idlTypes[dfnName] = dfn.dataset.dfnType;
        }
        definitionNames.add(dfnName);
      } else if (dfnId.match(/-[a-z]+error$/) && !dfnName.match(/\(/)) {
        const dfn = wrapWithDfn(el);
        dfn.dataset.lt = dfnName;
        dfn.dataset.dfnType = "exception";
        definitionNames.add(dfnName);
        idlTypes[dfnName] = dfn.dataset.dfnType;
      } else if (dfnId.match(/[-\.]prototype[-\.]/)) {
        // methods and attributes on objects

        // Skip headings with a space and no parenthesis
        // (they mention prototype but aren't a prototype property def)
        // with the exception of "set " and "get " headings
        // (which describe setters and getters)
        if (!dfnName.match(/\(/) && (dfnName.match(/ /) && !dfnName.match(/^[gs]et /))) return;

        // Skip unscoped internal methods à la [[SetPrototypeOf]](V)
        if (dfnName.match(/\[\[/)) return;

        // Skip symbol-based property definitions;
        // not clear they're useful as externally referenceable names
        if (dfnName.match(/@@/)) return;

        // Skip .constructor as that cannot be considered as an attribute
        if (dfnName.match(/\.constructor$/)) return;

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
      } else if (el.closest("#sec-value-properties-of-the-global-object")) {
        // properties of the global object
        if (el.id !== "#sec-value-properties-of-the-global-object"){
          const dfn = wrapWithDfn(el);
          dfn.dataset.lt = dfnName;
          dfn.dataset.dfnType = "attribute";
          dfn.dataset.dfnFor = "globalThis";
        }
      } else {
        // We handle other headings that look like a method / property
        // on an object instance (rather than its prototype)
        // or an abstract op

        // if there is already a dfn element, we move on
        if (el.querySelector("dfn")) return;

        // only dealing with well-known patterns
        if (!dfnName.match(scopedNameRegExp)
            && !dfnName.match(methodNameRegExp)
           ) return;
        // Skip symbol-based property definitions
        if (dfnName.match(/@@/)) return;

        // Skip .prototype as that cannot be considered
        // as an attribute
        if (dfnName.match(/\.prototype$/)) return;

        // Skip headings where foo.bar appears as part of a longer phrase
        if (!dfnName.match(/\(/) && dfnName.match(/ /)) return;

        // redundant definitions of constructors on the global object
        // e.g. "Array ( . . . )"
        if (dfnName.match(/\. \. \./)) return;

        const dfn = wrapWithDfn(el);

        if (dfnName.match(scopedNameRegExp)) {
          // set definition scope
          // This assumes that such methods and attributes are only defined
          // one-level deep from the global scope
          dfn.dataset.dfnFor = dfnName.replace(/\..*$/, '');
          dfnName = dfnName.replace(dfn.dataset.dfnFor + ".", '');
          if (dfnName.match(/\(/)) {
            dfnName = cleanMethodName(dfnName);
            dfn.dataset.lt = dfnName;
            dfn.dataset.dfnType = "method";
          } else {
            dfn.dataset.lt = dfnName;
            if (dfnName.match(/^[A-Z]+$/)) {
              dfn.dataset.dfnType = "const";
            } else {
              dfn.dataset.dfnType = "attribute";
            }
          }
        } else if (dfnName.match(abstractOpRegExp)) {
          dfnName = cleanMethodName(dfnName);
          dfn.dataset.lt = dfnName;
          const opName = dfnName.split('(')[0];

          // distinguish global constructors from abstract operations
          if (idlTypes[opName]) {
            dfn.dataset.dfnType = "constructor";
            dfn.dataset.dfnFor = opName;
          } else {
            // If the name is listed as an Abstract Method
            // we set the dfn-for accordingly
            // Note we look for a possibly more specific scope by looking at the
            // title of the containing section. This is useful for
            // "Environment Records" methods.
            if (abstractMethods[opName]) {
              const baseClass = abstractMethods[opName];
              let parent = dfn.parentNode.closest('emu-clause');
              while (parent) {
                const title = parent.querySelector('h1')?.textContent.replace(sectionNumberRegExp, '').trim();
                if (title?.toLowerCase().endsWith(baseClass.toLowerCase())) {
                  dfn.dataset.dfnFor = title;
                  break;
                }
                parent = parent.parentNode.closest('emu-clause');
              }
              if (!dfn.dataset.dfnFor) {
                dfn.dataset.dfnFor = baseClass;
              }
            }
            if (dfn.getAttribute("aoid")) {
              dfn.dataset.lt = dfn.getAttribute("aoid") + '|' + dfn.dataset.lt;
            }
            dfn.dataset.dfnType = "abstract-op";
          }
        } else { // methods of the global object
          dfnName = cleanMethodName(dfnName);
          dfn.dataset.lt = dfnName;
          dfn.dataset.dfnType = "method";
          dfn.dataset.dfnFor = "globalThis";
        }
        definitionNames.add(dfnName);
      }
    });
  // Extract abstract operations from <emu-eqn> with aoid attribute
  [...document.querySelectorAll("emu-eqn[aoid]")]
    .filter(legacySectionFilter)
    .forEach(el => {
      // Skip definitions of constant values (e.g. msPerDay)
      if (el.textContent.match(/=/)) return;
      const dfn = wrapWithDfn(el);
      dfn.dataset.lt = el.getAttribute("aoid");
      dfn.dataset.dfnType = "abstract-op";
      dfn.id = el.id;
    });

  // Extract State Components from tables
  [...document.querySelectorAll("figure > table")]
    .filter(legacySectionFilter)
    .forEach(el => {
      const title = el.parentNode.querySelector("figcaption")?.textContent || "";
      if (!title.match(/state components for/i)) return;
      const scope = title.replace(/^.*state components for/i, '').trim();
      for (const td of el.querySelectorAll("tr td:first-child")) {
        const dfn = wrapWithDfn(td);
        dfn.dataset.dfnFor = scope;
        dfn.id = el.closest("emu-table[id],emu-clause[id]").id;
      }
    });

  [...document.querySelectorAll("dfn")]
    .filter(legacySectionFilter)
    .forEach(el => {
      // Skip definitions in conformance page and conventions page
      if (el.closest('section[data-reffy-page$="conformance.html"]') ||
          el.closest('section[data-reffy-page$="notational-conventions.html"]')) {
        el.removeAttribute("id");
        return;
      }

      // rely on the aoid attribute as a hint we're dealing
      // with an abstract-op
      if (el.getAttribute("aoid")) {
        el.dataset.dfnType = "abstract-op";
      }

      // Mark well-known intrinsic objects as the same type as their visible object (if set), defaulting to "interface"
      if (el.textContent.match(/^%[A-Z].*%$/)) {
        el.dataset.dfnType = idlTypes[el.textContent.replace(/%/g, '')] || "interface";
        definitionNames.add(el.textContent.trim());
      }

      // %names% in the global object section are operations of the globalThis object
      if (el.closest('[data-reffy-page$="global-object.html"]') && el.textContent.match(/^%[a-z]+%/i)) {
        el.dataset.dfnFor = "globalThis";
        // TODO: this doesn't capture the arguments
        el.dataset.dfnType = "method";
      }

      // Mark well-known symbols as "const"
      // for lack of a better type, and as the WebIDL spec has been doing
      if (el.textContent.match(/^@@[a-z]*$/i)) {
        el.dataset.dfnType = "const";
      }
      if (el.getAttribute("variants")) {
        el.dataset.lt = (el.dataset.lt ?? el.textContent.trim()) + "|" + el.getAttribute("variants");
      }

      // Skip definitions that have already been identified
      // with a more specific typing
      if (!el.dataset.dfnType) {
        // we already have a matching typed definition
        if (definitionNames.has(el.textContent.trim())) return;
      }

      // If the <dfn> has no id, we attach it the one from the closest
      // <emu-clause> with an id
      // Note that this means several definitions can share the same id
      if (!el.getAttribute("id")) {
        if (el.closest("emu-clause[id]")) {
          el.setAttribute("id", el.closest("emu-clause").getAttribute("id"));
        }
      }

      // Any generic <dfn> not previously filtered out
      // is deemed to be exported, scoped to ECMAScript
      if (!el.dataset.dfnType) {
        if (!el.dataset.dfnFor) {
          el.dataset.dfnFor = "ECMAScript";
        }
        el.dataset.export = "";
      }
    });
  // Another pass of clean up for duplicates
  // This cannot be done in the first pass
  // because %Foo.prototype% does not necessarily get identified before
  // the equivalent " prototype object" dfn

  [...document.querySelectorAll("dfn[id][data-export]")]
    .filter(legacySectionFilter)
    .forEach(dfn => {
      // we have the syntactic equivalent %x.prototype%
      let m = dfn.textContent.trim().match(/^(.*) prototype( object)?$/);
      if (m && definitionNames.has(`%${m[1].trim()}.prototype%`)) {
        dfn.removeAttribute("id");
        delete dfn.dataset.export;
        return;
        }
    });
}

function preProcessHTML() {
  const headingSelector = ':is(h2,h3,h4,h5,h6)[id]:not(:is([data-dfn-type],[data-dfn-for],[data-export],[data-noexport],[data-lt])) dfn';

  // we copy the id on the dfn when it is set on the surrounding heading
  document.querySelectorAll(headingSelector)
    .forEach(el => {
      const headingId = el.closest("h2, h3, h4, h5, h6").id;
      if (!el.id) {
        el.id = headingId;
      }
    });
}

/**
 * CSS 2.1 does not use the definitions data model and needs to be processed
 * to create the right definitions.
 *
 * Note: CSS 2.2 does follow the definitions data model, but does not contain
 * any element that matches the `span.index-def` selector, so the function is
 * a no-op for CSS 2.2 and that's a good thing.
 */
function preProcessCSS2() {
  document.querySelectorAll('span.index-def')
    .forEach(span => {
      // Definition ID is to be found in a nearby anchor
      const anchor = span.querySelector('a[name]') ?? span.closest('a[name]');
      if (!anchor) {
        return;
      }

      // Once in a while, definition has a "<dfn>", and once in a while, that
      // "<dfn>" already follows the dfn data model.
      let dfn = span.querySelector('dfn') ?? span.closest('dfn');
      if (dfn?.id) {
        return;
      }

      // No "<dfn>"? Let's create it
      if (!dfn) {
        dfn = document.createElement('dfn');
        for (let child of [...span.childNodes]) {
          dfn.appendChild(child);
        }
        span.appendChild(dfn);
      }

      // Complete the "<dfn>" with expected attributes
      dfn.id = anchor.getAttribute('name');
      dfn.dataset.export = '';
      // Drop suffixes such "::definition of" and wrapping quotes,
      // and drop possible duplicates
      dfn.dataset.lt = (span.getAttribute('title') ?? dfn.textContent).split('|')
        .map(normalize)
        .map(text => text.replace(/::definition of$/, '')
          .replace(/, definition of$/, '')
          .replace(/^'(.*)'$/, '$1'))
        .filter((text, idx, array) => array.indexOf(text) === idx)
        .join('|');
      let dfnType = null;
      switch (anchor.getAttribute('class') ?? '') {
        case 'propdef-title':
          dfnType = 'property';
          break;
        case 'value-def':
          if (dfn.dataset.lt.match(/^<.*>$/)) {
            dfnType = 'type';
          }
          else {
            dfnType = 'value';
          }
          break;
      }
      if (dfnType) {
        dfn.dataset.dfnType = dfnType;
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

  document.querySelectorAll(".attrdef dfn[id]:not([data-dfn-type]):not([data-skip])")
    .forEach(el => {
      el.dataset.dfnType = "element-attr";
      const attrDesc = document.querySelector('[data-reffy-page$="attindex.html"] th span.attr-name a[href$="#' + el.id + '"]');
      if (attrDesc) {
          el.dataset.dfnFor = attrDesc.closest('tr').querySelector('td').textContent;
      } else {
        console.error("Could not find description for " + el.textContent);
      }
    });
  document.querySelectorAll("dt[id] > .adef, dt[id] > .property")
    .forEach(el => {
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
  document.querySelectorAll('b[id^="__svg__"]').forEach(el => {
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
  document.querySelectorAll('h3[id^="Interface"]:not([data-dfn-type])').forEach(el => {
    const name = el.id.slice("Interface".length);
    if (idlTree.find(i => i.name === name && i.type === "interface")) {
      el.dataset.dfnType = "interface";
      el.dataset.lt = name;
    }
  });
  document.querySelectorAll('b[id]:not([data-dfn-type])').forEach(el => {
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

/**
 * The CDDL RFC defines a standard prelude with a number of CDDL types that
 * other specs that define CDDL make extensive use of. To be able to link back
 * to these type definitions from other specs, we need these types to appear
 * in the dfns extract of the RFC somehow.
 *
 * Now, the RFC only defines one ID for the appendix that contains the
 * standard prelude. We need to "share" that ID across all types. To avoid
 * introducing definitions that have the same ID and href, which could perhaps
 * confuse tools that ingest the definitions, the approach taken here is to
 * create a single definition that contains all the types as linking text.
 */
function preProcessRFC8610() {
  // The RFC is defined as a set of pages (yuck!)
  // The standard prelude is an appendix, let's look for it
  const prePages = [...document.querySelectorAll('pre.newpage')];
  const preludeStart = /<a [^>]*id=[^>]*>Appendix .<\/a>\.\s+Standard Prelude/;
  const preludeEnd = /Figure \d+: CDDL Prelude/;
  const preStart = prePages
    .findIndex(pre => pre.innerHTML.match(preludeStart));
  if (preStart === -1) {
    // Can't find the expected prelude start text, not a good start!
    return;
  }
  const preEnd = prePages
    .findIndex((pre, idx) => idx >= preStart && pre.innerHTML.match(preludeEnd));
  if (preEnd === -1) {
    // Can't find the expected prelude ending text, not a good start!
    return;
  }

  // Extract the list of types defined in the appendix
  const preludeTypes = prePages.slice(preStart, preEnd + 1)
    .map(pre => [...pre.innerHTML.matchAll(/^\s+([a-z0-9\-]+) = .*$/mg)]
      .map(m => m[1])
    )
    .flat();

  // Convert the appendix heading into a cddl-type definition that lists
  // all CDDL types.
  const el = prePages[preStart].querySelector(`a[id]`);
  const dfn = document.createElement("dfn");
  dfn.id = el.id;
  dfn.dataset.dfnType = 'cddl-type';
  dfn.dataset.lt = preludeTypes.join('|');
  dfn.dataset.export = '';
  dfn.textContent = el.textContent;
  el.replaceWith(dfn);
}