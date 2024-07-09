/**
 * Extract normative algorithms defined in specs.
 *
 * An algorithm extract is essentially an object with the following keys:
 * - `name`: The name of the algorithm, when one exists
 * - `href`: The URL with fragment to reach the algorithm, when one exists
 * - `html`: Some introductory prose for the algorithm. That prose may well
 * contain actual algorithmic operations, e.g.: "When invoked, run the following
 * steps in parallel". href/src attributes in the HTML have absolute URLs.
 * - `rationale`: A short string indicating the rationale for selecting the
 * algorithm. This property is mainly intended for helping with debugging.
 * Example values include ".algorithm" when the algorithm comes with an
 * "algorithm" class, "let" when a step was found with a related operation,
 * etc. Any verb in `stepOperations` may appear, as well as a few other regular
 * expressions (serialized as a string).
 * - `steps`: Atomic algorithm steps.
 *
 * Each step is essentially an object that follows the same structure as an
 * algorithm, except that it does not have `name`, `href` and `rationale` keys,
 * and may also have the following keys:
 * - `operation`: Gives the name of the main operation performed by the step,
 * for example "switch", "let", "set", "if", "return", "resolve", "reject",
 * "queue a task", "fire an event", etc.
 * - `case`: Used in switch steps to identify the switch condition that
 * triggers the step.
 * - `ignored`: Ordered lists found at the step level that do no look like
 * algorithm steps. Or maybe they are? The lists should get reviewed: they
 * usually describe inputs/outputs or conditions, but they may signal parts
 * where the extraction logic needs to be improved. The lists are reported as
 * text prose.
 * - `additional`: Each step should contain one and only one algorithm. When
 * other algorithms are found at the same level, they get reported in that
 * property. That usually either signals that the spec could be improved
 * because if fails to use different list items for different steps, and/or
 * that the extraction logic needs to be smarter.
 *
 * TODO: flag step operation when understood (queue a task, fire an event,
 *  run in parallel, etc.) to ease analysis.
 *  (the property is only set for identified "switch" constructs for now)
 * TODO: handle "read requests"
 *  https://fetch.spec.whatwg.org/#incrementally-read-loop
 *  https://w3c.github.io/webcodecs/#imagedecoder-fetch-stream-data-loop
 * TODO: handle "fetch" process request/response algorithms
 *  https://wicg.github.io/background-fetch/#complete-a-record
 *  https://wicg.github.io/nav-speculation/prefetch.html#create-navigation-params-by-fetching
 * TODO: support a switch without a ".switch" class
 *  https://w3c.github.io/webcodecs/#dom-videoframe-videoframe
 *  https://w3c.github.io/web-nfc/#dfn-map-text-to-ndef
 * TODO: support a switch that is not phrased as a switch
 *  https://w3c.github.io/clipboard-apis/#to-os-specific-well-known-format
 * TODO: support a switch where cases don't have <dd>
 *  https://fidoalliance.org/specs/fido-v2.1-ps-20210615/fido-client-to-authenticator-protocol-v2.1-ps-errata-20220621.html#sctn-minpinlength-extension
 * TODO: don't get confused by conditions that look like steps
 *  (code reports them as "ignored", that's a good start, ignore them fully!)
 *  https://w3c.github.io/webcodecs/#imagedecoder-decode-complete-frame
 *  https://w3c.github.io/presentation-api/#dom-presentationrequest-start
 *  https://w3c.github.io/clipboard-apis/#dom-clipboard-read
 * TODO: don't get confused by informative "algorithms"
 *  (noting informative sections are not flagged as such in Bikeshed)
 *  https://drafts.csswg.org/css-view-transitions-2/#lifecycle
 * TODO: convert branching operations to substeps when needed ("if")
 *  https://drafts.css-houdini.org/css-layout-api-1/#construct-a-fragment-result
 *  https://w3c.github.io/webappsec-credential-management/#dom-passwordcredential-store-slot
 *  https://dom.spec.whatwg.org/#concept-create-element
 * TODO: don't get confused by intermediary notes that jeopardize steps lists
 *  (but then, the specs need fixing!)
 *  https://w3c.github.io/secure-payment-confirmation/#sctn-steps-to-check-if-a-payment-can-be-made
 *  https://w3c.github.io/ServiceWorker/#on-fetch-request-algorithm
 *  https://wicg.github.io/turtledove/#dom-navigator-createauctionnonce
 * TODO: convert inline operations to substeps when needed
 * TODO: filter out CSS algorithms that are not JS algorithms
 *  https://drafts.fxtf.org/filter-effects/#interpolation-of-filter-functions
 * TODO: improve the algorithm steps detection mechanism. It's relatively easy
 *  to miss steps.
 * TODO: don't skip intermediary <dl> levels and/or support "struct with keys"
 *  https://w3c.github.io/webdriver-bidi/#parse-url-pattern
 * TODO: don't get confused by a switch that follows steps
 *  https://w3c.github.io/geolocation/#dfn-acquire-a-position
 * TODO: support TC39 specs with <emu-alg> clauses
 *  https://tc39.es/ecma402/
 * TODO: skip monkeypatching identified as such?
 *  https://wicg.github.io/scroll-to-text-fragment/
 *
 * And then later:
 * TODO: extract algorithm parameters
 *
 * @function
 * @public
 * @return {Array(Object)} An Array of algorithms
*/

import informativeSelector from './informative-selector.mjs';
import getAbsoluteUrl from './get-absolute-url.mjs';
import cloneAndClean from './clone-and-clean.mjs';


/**
 * Algorithm steps typically start with verbs that define the operation to
 * perform.
 *
 * The following list of verbs is used to assess whether a set of steps "looks
 * like" a set of algorithm steps, so as to avoid extracting lists that are not
 * algorithms.
 *
 * The list is completed with a few branching operations that are not verbs:
 * "for", "if", "while".
 *
 * Using a growing list of verbs may not be a good idea. That said, it is an
 * instructive exercise to analyze the diversity of operations being used,
 * and their meaning (or lack of).
 *
 * Note some steps may start with an adverb, e.g., "Additionally",
 * "Optionally", "Asynchronously", or with contextualizations such as
 * "In step 6". These forms are not captured here. They will be captured
 * through the inline operations (see below) or need to be handled separately.
 * They will be reported in the `ignored` property otherwise.
 *
 * Note "Asynchronously", typically used in Service Workers, does not mean much
 * in a browsing context. It should probably rather be re-written using
 * "in parallel"
 *  https://w3c.github.io/ServiceWorker/
 */
const stepOperations = [
  'abort',
  'acknowledge',
  'activate',
  'add',
  'adopt',
  'advance',
  'append',
  'apply',
  'ask',
  'assert',
  'assign',
  'attach',
  'attempt',
  'batch',
  'block',
  'branch',
  'call',
  'check',
  'cancel',
  'cause',
  'change',
  'choose',
  'clamp',
  'clean',
  'clear',
  'close',
  'collect',
  'complete',
  'compute',
  'consume',
  'continue',
  'convert',
  'copy',
  'create',
  'deactivate',
  'decrease',
  'decrement',
  'decrypt',
  'define',
  'delete',
  'dequeue',
  'destroy',
  'determine',
  'discard',
  'dismiss',
  'dispatch',
  'display',
  'down-mix',
  'do',
  'dump',
  'emit',
  'empty',
  'end',
  'enqueue',
  'ensure',
  'error',
  'establish',
  'execute',
  'extend',
  'extract',
  'fail',
  'fetch',
  'finalize',
  'find',
  'finish',
  'fire',
  'gather',
  'generate',
  'give',
  'handle',
  'hand-off',
  'increase',
  'increment',
  'initialize',
  'insert',
  'interpret',
  'invoke',
  'issue',
  'jump',
  'let',
  'load',
  'make',
  'mark',
  'match',
  'move',
  'multiply',
  'navigate',
  'paint',
  'parse',
  'perform',
  'place',
  'pop',
  'populate',
  'prepare',
  'prepend',
  'process',
  'prompt',
  'push',
  'query',
  'queue',
  'recalculate',
  'rectify',
  'reference',
  'register',
  'reinitialize',
  'reject',
  'release',
  'remove',
  'replace',
  'reset',
  'resolve',
  'resolve',
  'restore',
  'render',
  'remap',
  'report',
  'return',
  'run',
  'score',
  'scroll',
  'send',
  'serialize',
  'set',
  'shuffle',
  'skip',
  'sort',
  'split',
  'spin',
  'start',
  'stop',
  'store',
  'strip',
  'suspend',
  'switch',
  'take',
  'terminate',
  'throw',
  'trap',
  'try',
  'undisplay',
  'unset',
  'up-mix',
  'update',
  'update',
  'upgrade',
  'use',
  'validate',
  'verify',
  'visit',
  'wait',

  'for',
  'if',
  'while'
];


/**
 * When the step does not start with a verb, or when that verb is not followed
 * by a white space, the following constructs help detect the actual operation.
 */
const stepInlineOperations = [
  'abort all these steps',
  'abort these steps',
  'fire a simple event',
  'fire an event',
  'in parallel',
  'reject',
  'resolve',
  'run the following steps',
  'run these steps',
  'terminate these steps',
  /queue a( \w+)? task/i
];


/**
 * Additional anchors that suggest algorithm steps
 */
const stepAnchors = [
  /^⌛/,
  'in parallel',
  /^otherwise(\,| )/i,
];


/**
 * Return the normalized text content for the given DOM element, removing all
 * annotations
 */
function getTextContent(el) {
  const clone = cloneAndClean(el);
  return normalize(clone.textContent);
}


/**
 * Return the normalized HTML content for the given DOM element, removing all
 * annotations
 */
function getHTMLContent(el) {
  // Prepare mapping table to turn relative links to absolute ones
  // (we cannot do that once the element has been cloned because cloning
  // removes the element from the DOM tree)
  const relativeUrlSelector = '[href]:not([href^="http"]),[src]:not([src^="http"])';
  const relativeToAbsolute = {};
  const page = el.closest('[data-reffy-page]')?.getAttribute('data-reffy-page');
  for (const linkEl of el.querySelectorAll(relativeUrlSelector)) {
    const attr = linkEl.getAttribute('href') ? 'href' : 'src';
    const url = new URL(page ?? window.location.href);
    url.hash = linkEl.getAttribute(attr);
    relativeToAbsolute[linkEl.getAttribute(attr)] = url.toString();
  }

  const clone = cloneAndClean(el);
  for (const linkEl of clone.querySelectorAll(relativeUrlSelector)) {
    const attr = linkEl.getAttribute('href') ? 'href' : 'src';
    linkEl.setAttribute(attr, relativeToAbsolute[linkEl.getAttribute(attr)]);
  }
  return clone.innerHTML.trim();
}

/**
 * Normalize a text for serialization purpose
 */
function normalize(str) {
  return str.replace(/\r|\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Return the name and href of the first dfn contained in the given element
 */
function getDefinedNameIn(el) {
  const dfn = el.nodeName === 'DFN' ?
    el :
    el.querySelector('dfn,h2[data-dfn-type],h3[data-dfn-type],h4[data-dfn-type],h5[data-dfn-type],h6[data-dfn-type]');
  if (dfn) {
    let name = '';
    if (dfn.getAttribute('data-dfn-for')) {
      name = normalize(dfn.getAttribute('data-dfn-for').split(/,(?![^\(]*\))/)[0]) + '/';
    }
    if (dfn.getAttribute('data-lt')) {
      name += normalize(dfn.getAttribute('data-lt').split('|')[0]);
    }
    else {
      name += getTextContent(dfn);
    }
    const href = dfn.id ? getAbsoluteUrl(dfn) : null;
    return { name, href };
  }
  else {
    const heading = el.querySelector('h2[id],h3[id],h4[id],h5[id],h6[id]');
    if (heading) {
      return { name: getTextContent(heading), href: getAbsoluteUrl(heading) };
    }
  }
  return {};
}

/**
 * Find information about an algorithm (name and href).
 *
 * The name is given by a nearby `dfn`. If there's no nearby `dfn`, the
 * name is the content of the preceding paragraph.
 */
function getAlgorithmInfo(algo, context) {
  // Look for a name in the algorithm container, if there's one.
  // Note some specs add the "algorithm" class to the `<ol>` and to the
  // wrapping container, and define the name in the wrapping container.
  let info = {};
  let container = algo.root.closest('.algorithm');
  while (container) {
    if (container && !context?.nested) {
      if (container.getAttribute('data-algorithm')) {
        info.name = normalize(container.getAttribute('data-algorithm'));
        if (container.id) {
          // Use the container ID as anchor
          info.href = getAbsoluteUrl(container);
        }
        else {
          // Container has no ID but if there's a dfn in there, that's probably
          // the right anchor
          const dfn = getDefinedNameIn(container);
          if (dfn) {
            info.href = dfn.href;
          }
        }
        break;
      }
      else {
        info = getDefinedNameIn(container);
      }
    }
    container = container.parentElement.closest('.algorithm');
  }

  // Get the introductory prose from the previous paragraph
  let paragraph = algo.root.previousElementSibling;
  while (paragraph && paragraph.nodeName !== 'P') {
    paragraph = paragraph.previousElementSibling;
  }
  if (paragraph) {
    // Also look for a definition in the paragraph if we don't have a name and
    // href already.
    if (!context?.nested && !(info.name && info.href)) {
      info = Object.assign(getDefinedNameIn(paragraph), info);
    }
    info.html = getHTMLContent(paragraph);
  }
  else if (['LI', 'DD', 'DIV'].includes(algo.root.parentElement.nodeName)) {
    // If there's no paragraph, we may be in a list or definition list, the
    // introductory prose is whatever text exists before the algorithm
    const textEl = document.createElement('div');
    let node = algo.root.parentElement.firstChild;
    while (node !== algo.root) {
      textEl.appendChild(node.cloneNode(true));
      node = node.nextSibling;
    }
    if (!context?.nested && !(info.name && info.href)) {
      info = Object.assign(getDefinedNameIn(textEl), info);
    }
    info.html = getHTMLContent(textEl);
  }

  if (!context?.nested && !(info.name && info.href) &&
      algo.root.parentElement.nodeName === 'DD') {
    let dt = algo.root.parentElement.previousElementSibling;
    while (dt && dt.nodeName !== 'DT') {
      dt = dt.previousElementSibling;
    }
    if (dt) {
      info = Object.assign(getDefinedNameIn(dt), info);
    }
  }

  // TODO: look for the closest heading?
  return info;
}

/**
 * Serialize the given algorithm
 *
 * Context object allows to distinguish between top-level algorithms and
 * nested ones. Nested ones typically don't have names.
 */
function serializeAlgorithm(algo, context) {
  let res = getAlgorithmInfo(algo, context);
  res.rationale = algo.rationale;
  res.steps = serializeSteps(algo.root);
  return res;
}

/**
 * Serialize the given steps contained in the given root element.
 */
function serializeSteps(root) {
  if (root.nodeName === 'DL') {
    return [
      {
        operation: 'switch',
        steps: [...root.querySelectorAll('& > dt')].map(option => {
          let dd = option.nextElementSibling;
          while (dd && dd.nodeName !== 'DD') {
            dd = dd.nextElementSibling;
          }
          if (!dd) {
            throw new Error('Switch option without <dd> found: ' + option.textContent);
          }
          return {
            'case': getTextContent(option),
            steps: serializeSteps(dd)
          };
        })
      }
    ]
  }
  else if (root.nodeName === 'OL') {
    return [...root.querySelectorAll('& > li')].map(serializeStep);
  }
  else {
    return [serializeStep(root)];
  }
}

/**
 * Serialize an algorithm step
 */
function serializeStep(li) {
  let res = {};
  const candidateAlgorithms = findAlgorithms(li, { includeIgnored: true });
  const algorithms = candidateAlgorithms.filter(algo => !!algo.rationale);
  if (algorithms.length > 0) {
    res = serializeAlgorithm(algorithms[0], { nested: true });
  }
  if (!res.html) {
    res.html = getHTMLContent(li);
  }
  if (algorithms.length > 1) {
    res.additional = algorithms.slice(1)
      .map(algo => serializeAlgorithm(algo, { nested: true }));
  }
  const ignoredAlgorithms = candidateAlgorithms
    .filter(algo => !algo.rationale)
    .map(algo => getTextContent(algo.root));
  if (ignoredAlgorithms.length > 0) {
    res.ignored = ignoredAlgorithms;
  }
  return res;
}

/**
 * Parse a list element looking for algorithmic operations or other anchors
 * that should allow us to assess that the steps are indeed part of an
 * algorithm. Return a string representation of that rationale.
 */
function findRationale(ol) {
  let rationale = null;

  if (ol.matches('.algorithm')) {
    return '.algorithm';
  }
  [...ol.querySelectorAll('li')].find(li => {
    const text = getTextContent(li).toLowerCase();
    rationale = stepOperations.find(op => {
      return text.match(new RegExp(`^${op}(\\.|:| )`, 'i'));
    });

    if (!rationale) {
      rationale = stepInlineOperations.find(op => {
        if (typeof op === 'string') {
          return text.includes(op);
        }
        else {
          return text.match(op);
        }
      });
    }

    if (!rationale) {
      rationale = stepAnchors.find(anchor => {
        if (typeof anchor === 'string') {
          return text.includes(anchor);
        }
        else {
          return text.match(anchor);
        }
      });
    }

    return !!rationale;
  });

  return rationale?.toString();
}


/**
 * Find the list of normative algorithms defined in the document's section
 */
function findAlgorithms(section, { includeIgnored } = { includeIgnored: false }) {
  // Well-behaved algorithms have an "algorithm" class and start with an <ol>,
  // or they have a "switch" class, à la:
  // https://dom.spec.whatwg.org/#locate-a-namespace
  const actual = [...section.querySelectorAll('.algorithm,.switch')]
    .filter(el => !el.closest(informativeSelector))
    .map(el => Object.assign({
      rationale: el.matches('.algorithm') ? '.algorithm' : '.switch',
      root: el
    }))
    .map(algo => {
      if (algo.root.nodeName !== 'DL' && algo.root.nodeName !== 'OL') {
        algo.root = algo.root.querySelector('ol');
      }
      return algo;
    })
    .filter(algo => !!algo.root);

  // Probable algorithms do not have an "algorithm" class but start with an <ol>
  const probable = [...section.querySelectorAll('ol')]
    .filter(ol => !ol.closest(informativeSelector))
    .filter(ol => !ol.closest('nav,.toc,#toc'))
    .filter(ol => !actual.find(algo => algo.root.contains(ol)))
    // Find an interesting anchor in there to filter out
    // lists that don't look like steps
    .map(ol => {
      const rationale = findRationale(ol);
      return { rationale: rationale?.toString(), root: ol };
    })
    .filter(algo => includeIgnored || !!algo.rationale);

  // Merge actual and probable algorithms, dropping duplicates and algorithms
  // that are nested under other algorithms.
  let all = actual.concat(probable);
  all = all.filter((algo, idx) => all.findIndex(al => al.root === algo.root) === idx);
  all = all.filter(algo1 => !all.find(algo2 => algo1 !== algo2 && algo2.root.contains(algo1.root)));

  // Consider algorithms in document order
  // (if we find more than one at the same level, first one will be reported as
  // the actual algorithm, the other ones as "additional" algorithms)
  all.sort((algo1, algo2) => {
    if (algo1.rationale && !algo2.rationale) {
      return -1;
    }
    if (algo2.rationale && !algo1.rationale) {
      return 1;
    }
    const cmp = algo1.root.compareDocumentPosition(algo2.root);
    if (cmp & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    else if (algo1.root !== algo2.root) {
      return -1;
    }
  });
  return all;
}


export default function (spec, idToHeading = {}) {
  // ECMA specs typically use <emu-alg> clauses, not supported for now.
  if (spec.organization === 'Ecma International') {
    return [];
  }
  const algorithms = findAlgorithms(document);
  return algorithms.map(algo => serializeAlgorithm(algo));
}