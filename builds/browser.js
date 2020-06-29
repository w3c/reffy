/* File generated with rollup.js, do not edit directly! See source code in src/browserlib */
(function () {
  'use strict';

  /**
   * Gets the title of the document
   */
  function getTitle () {
    const title = window.document.querySelector('title');
    if (title) {
      return title.textContent.trim();
    }
    else {
      return '[No title found for ' + window.location.href + ']';
    }
  }

  /**
   * Return the name of a well-known generator that was used to generate the
   * spec, if known.
   *
   * This function expects to run within a browser context.
   *
   * @function
   * @public
   * @param {Window} window
   * @return {Promise} The promise to get a document ready for extraction and
   *   the name of the generator (or null if generator is unknown).
   */
  function getGenerator () {
      const generator = window.document.querySelector('meta[name="generator"]');
      if (generator && generator.content.match(/bikeshed/i)) {
          return 'bikeshed';
      }
      else if ((generator && generator.content.match(/respec/i)) ||
              (document.body.id === 'respecDocument') ||
              window.respecConfig ||
              window.eval('typeof respecConfig !== "undefined"')) {
          return 'respec';
      }
      else {
          return null;
      }
  }

  function getLastModifiedDate () {
    const dateEl = document.querySelector('.head time');
    const statusAndDate = [...document.querySelectorAll('.head h2')]
      .map(el => el.textContent).join(' ').trim();
    const lastModified = new Date(Date.parse(document.lastModified));
    const date = dateEl ? dateEl.textContent.trim() :
      (statusAndDate ? statusAndDate.split(/\s+/).slice(-3).join(' ') :
      [
        lastModified.toLocaleDateString('en-US', { day: 'numeric' }),
        lastModified.toLocaleDateString('en-US', { month: 'long' }),
        lastModified.toLocaleDateString('en-US', { year: 'numeric' })
      ].join(' '));
    return date;
  }

  /**
   * Extract the list of WebIDL definitions in the current spec
   *
   * @function
   * @public 
   * @return {Promise} The promise to get a dump of the IDL definitions, or
   *   an empty string if the spec does not contain any IDL.
   */
  function extractWebIdl () {
      const generator = getGenerator();
      if (generator === 'bikeshed') {
          return extractBikeshedIdl();
      }
      else if (document.title.startsWith('Web IDL')) {
          // IDL content in the Web IDL spec are... examples,
          // not real definitions
          return '';
      }
      else {
          // Most non-ReSpec specs still follow the ReSpec conventions
          // for IDL definitions
          return extractRespecIdl();
      }
  }


  /**
   * Extract IDL definitions from a Bikeshed spec
   *
   * Note Bikeshed summarizes IDL definitions in an appendix. This is
   * what the code uses.
   */
  function extractBikeshedIdl() {
      const idlHeading = document.getElementById('idl-index');
      if (idlHeading) {
          const nextEl = idlHeading.nextElementSibling;
          if (nextEl) {
              return nextEl.textContent;
          }
          else {
              throw new Error('Could not find IDL in IDL index');
          }
      }
      else {
          // the document may have been generated with "omit idl-index"
          // in which case, we try the simple way
          return extractRespecIdl();
      }
  }


  /**
   * Extract IDL definitions from a ReSpec spec, and in practice from
   * most other specs as well.
   *
   * The function tries all known patterns used to define IDL content, making
   * sure that it only extracts elements once.
   */
  function extractRespecIdl() {
      // IDL filter voluntarily similar to that defined in Respec to exclude
      // IDL defined with an `exclude` class:
      // https://github.com/w3c/respec/blob/develop/src/core/utils.js#L69
      // https://tabatkins.github.io/bikeshed/#metadata-informative-classes
      const nonNormativeSelector = [
          '.informative', '.note', '.issue', '.example', '.ednote', '.practice',
          '.introductory', '.non-normative'
      ].join(',');

      // Helper function that trims individual lines in an IDL block,
      // removing as much space as possible from the beginning of the page
      // while preserving indentation. Rules followed:
      // - Always trim the first line
      // - Remove whitespaces from the end of each line
      // - Replace lines that contain spaces with empty lines
      // - Drop same number of leading whitespaces from all other lines
      const trimIdlSpaces = idl => {
          const lines = idl.trim().split('\n');
          const toRemove = lines
              .slice(1)
              .filter(line => line.search(/\S/) > -1)
              .reduce(
                  (min, line) => Math.min(min, line.search(/\S/)),
                  Number.MAX_VALUE);
          return lines
              .map(line => {
                  let firstRealChat = line.search(/\S/);
                  if (firstRealChat === -1) {
                      return '';
                  }
                  else if (firstRealChat === 0) {
                      return line.replace(/\s+$/, '');
                  }
                  else {
                      return line.substring(toRemove).replace(/\s+$/, '');
                  }
              })
              .join('\n');
      };

      // Detect the IDL index appendix if there's one (to exclude it)
      const idlEl = document.querySelector('#idl-index pre') ||
          document.querySelector('.chapter-idl pre'); // SVG 2 draft

      let idl = [
          'pre.idl:not(.exclude):not(.extract):not(#actual-idl-index)',
          'pre:not(.exclude):not(.extract) > code.idl-code:not(.exclude):not(.extract)',
          'pre:not(.exclude):not(.extract) > code.idl:not(.exclude):not(.extract)',
          'div.idl-code:not(.exclude):not(.extract) > pre:not(.exclude):not(.extract)',
          'pre.widl:not(.exclude):not(.extract)'
      ]
          .map(sel => [...document.querySelectorAll(sel)])
          .reduce((res, elements) => res.concat(elements), [])
          .filter(el => el !== idlEl)
          .filter((el, idx, self) => self.indexOf(el) === idx)
          .filter(el => !el.closest(nonNormativeSelector))
          .map(el => el.cloneNode(true))
          .map(el => {
              const header = el.querySelector('.idlHeader');
              if (header) {
                  header.remove();
              }
              const tests = el.querySelector('details.respec-tests-details');
              if (tests) {
                  tests.remove();
              }
              return el;
          })
          .map(el => trimIdlSpaces(el.textContent))
          .join('\n\n');

      return idl;
  }

  /**
   * Extract the list of CSS definitions in the current spec
   *
   * @function
   * @public 
   * @return {Promise} The promise to get an extract of the CSS definitions, or
   *   an empty CSS description object if the spec does not contain any CSS
   *   definition. The return object will have properties named "properties",
   *  "descriptors", and "valuespaces".
   */
  function extractCSS () {
    let res = {
      properties: extractTableDfns(document, 'propdef'),
      descriptors: extractTableDfns(document, 'descdef'),
      valuespaces: extractValueSpaces(document)
    };

    // Try old recipes if we couldn't extract anything
    if ((Object.keys(res.properties).length === 0) &&
        (Object.keys(res.descriptors).length === 0)) {
      res.properties = extractDlDfns(document, 'propdef');
      res.descriptors = extractDlDfns(document, 'descdef');
    }

    return res;
  }


  /**
   * Converts a definition label as it appears in a CSS spec to a lower camel
   * case property name.
   *
   * @param  {String} label Definition label
   * @return {String} lower camel case property name for the label
   */
  const dfnLabel2Property = label => label.trim()
    .replace(/:/, '')
    .split(' ')
    .map((str, idx) => (idx === 0) ?
      str.toLowerCase() :
      str.charAt(0).toUpperCase() + str.slice(1))
    .join('');


  /**
   * Extract a CSS definition from a table
   *
   * All recent CSS specs should follow that pattern
   */
  const extractTableDfn = table => {
    let res = {};
    const lines = [...table.querySelectorAll('tr')]
      .map(line => Object.assign({
        name: dfnLabel2Property(line.querySelector(':first-child').textContent),
        value: line.querySelector('td:last-child').textContent.trim().replace(/\s+/g, ' ')
      }));
    for (let prop of lines) {
      res[prop.name] = prop.value;
    }
    return res;
  };


  /**
   * Extract a CSS definition from a dl list
   *
   * Used in "old" CSS specs
   */
  const extractDlDfn = dl => {
    let res = {};
    res.name = dl.querySelector('dt').textContent.replace(/'/g, '').trim();
    const lines = [...dl.querySelectorAll('dd table tr')]
      .map(line => Object.assign({
        name: dfnLabel2Property(line.querySelector(':first-child').textContent),
        value: line.querySelector('td:last-child').textContent.trim().replace(/\s+/g, ' ')
      }));
    for (let prop of lines) {
      res[prop.name] = prop.value;
    }
    return res;
  };


  /**
   * Extract CSS definitions in a spec using the given CSS selector and extractor
   */
  const extractDfns = (doc, selector, extractor) => {
    let res = {};
    [...doc.querySelectorAll(selector)]
      .map(extractor)
      .filter(dfn => !!dfn.name)
      .map(dfn => dfn.name.split(',').map(name => Object.assign({},
        dfn, { name: name.trim() })))
      .reduce((acc, val) => acc.concat(val), [])
      .forEach(dfn => {
        if ((dfn.name === 'property-name') ||
            (dfn.name === '--*')) {
          // Ignore sample definition && custom properties definition
          return;
        }
        res[dfn.name] = dfn;
      });
    return res;
  };


  /**
   * Extract CSS definitions in tables for the given class name
   * (typically one of `propdef` or `descdef`)
   */
  const extractTableDfns = (doc, className) =>
    extractDfns(doc, 'table.' + className + ':not(.attrdef)', extractTableDfn);


  /**
   * Extract CSS definitions in a dl list for the given class name
   * (typically one of `propdef` or `descdef`)
   */
  const extractDlDfns = (doc, className) =>
    extractDfns(doc, 'div.' + className + ' dl', extractDlDfn);


  /**
   * Extract value spaces (non-terminal values) defined in the specification
   */
  const extractValueSpaces = doc => {
    let res = {};

    const parseProductionRules = rules =>
      rules
        .map(val => val.split(/\n(?=[^\n]*\s?=\s)/m))
        .reduce((acc, val) => acc.concat(val), [])
        .map(line => line.split(/\s?=\s/).map(s => s.trim().replace(/\s+/g, ' ')))
        .filter(val => val[0].match(/^<.*>$|^.*\(\)$/))
        .filter(val => !!val[1])
        .forEach(val => res[val[0].replace(/^(.*\(\))$/, '<$1>')] = {
          value: val[1]
        });

    // Extract non-terminal value spaces defined in `pre` tags
    // (remove note references as in:
    // https://drafts.csswg.org/css-syntax-3/#the-anb-type)
    parseProductionRules([...doc.querySelectorAll('pre.prod')]
      .map(el => {
        [...el.querySelectorAll('sup')]
          .map(sup => sup.parentNode.removeChild(sup));
        return el;
      })
      .map(el => el.textContent));

    // Complete with non-terminal value spaces defined in `pre` tags without
    // an explicit class, as in:
    // https://drafts.fxtf.org/compositing-1/#ltblendmodegt
    parseProductionRules([...doc.querySelectorAll('pre:not(.idl)')]
      .filter(el => el.querySelector('dfn'))
      .map(el => el.textContent));

    // Complete with non-terminal value spaces defined in `dt` tags, as in:
    // https://drafts.csswg.org/css-shapes-1/#funcdef-inset
    // https://drafts.csswg.org/css-transforms/#funcdef-transform-matrix
    parseProductionRules([...doc.querySelectorAll('dt > dfn.css, dt > span.prod > dfn.css')]
      .filter(el => el.parentNode.textContent.match(/\s?=\s/))
      .map(el => el.parentNode.textContent));

    // Complete with function values defined in `dt` tags where definition and
    // value are mixed together, as in:
    // https://drafts.csswg.org/css-overflow-4/#funcdef-text-overflow-fade
    parseProductionRules([...doc.querySelectorAll('dt > dfn.css')]
      .filter(el => el.parentNode.textContent.trim().match(/^[a-zA-Z_][a-zA-Z0-9_\-]+\([^\)]*\)$/))
      .map(el => {
        let fn = el.parentNode.textContent.trim()
          .match(/^([a-zA-Z_][a-zA-Z0-9_\-]+)\([^\)]*\)$/)[1];
        return fn + '() = ' + el.parentNode.textContent;
      }));


    // Complete with non-terminal value spaces defined in `.definition`
    // paragraphs, as in:
    // https://svgwg.org/svg2-draft/painting.html#DataTypeDasharray
    parseProductionRules([...doc.querySelectorAll('.definition > dfn')]
      .filter(el => el.parentNode.textContent.match(/\s?=\s/))
      .map(el => el.parentNode.textContent));

    // Complete with non-terminal value spaces defined in simple paragraphs,
    // as in:
    // https://drafts.csswg.org/css-animations-2/#typedef-single-animation-composition
    // https://drafts.csswg.org/css-transitions/#single-transition-property
    parseProductionRules([...doc.querySelectorAll('p > dfn, div.prod > dfn')]
      .filter(el => el.parentNode.textContent.trim().match(/^<.*>\s?=\s/))
      .map(el => el.parentNode.textContent));

    // Complete with non-terminal value spaces defined in `dt` tags with
    // production rules (or prose) in `dd` tags, as in:
    // https://drafts.csswg.org/css-fonts/#absolute-size-value
    // https://drafts.csswg.org/css-content/#typedef-content-content-list
    [...doc.querySelectorAll('dt > dfn, dt > var')]
      .filter(el => el.textContent.trim().match(/^<.*>$/))
      .filter(el => {
        let link = el.querySelector('a[href]');
        if (!link) {
          return true;
        }
        let href = (link ? link.getAttribute('href') : null);
        return (href === '#' + el.getAttribute('id'));
      })
      .map(el => {
        let dd = el.parentNode;
        while (dd && (dd.nodeName !== 'DD')) {
          dd = dd.nextSibling;
        }
        if (!dd) {
          return null;
        }
        let code = dd.querySelector('p > code, pre.prod');
        if (code) {
          return {
            name: el.textContent.trim(),
            value: code.textContent.trim().replace(/\s+/g, ' ')
          }
        }
        else {
          return {
            name: el.textContent.trim(),
            prose: dd.textContent.trim().replace(/\s+/g, ' ')
          };
        }
      })
      .filter(space => !!space)
      .forEach(space => {
        res[space.name] = {};
        if (space.prose) {
          res[space.name].prose = space.prose;
        }
        if (space.value) {
          res[space.name].value = space.value;
        }
      });

    return res;
  };

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
   *
   * @function
   * @public
   * @return {Array(Object)} An Array of definitions
  */

  function definitionMapper(el) {
    function normalize(str) {
      return str.trim().replace(/\s+/g, ' ');
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

      // Definition is public if explictly marked as exportable or if export has
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

      ].join(','))
    };
  }

  function extractDefinitions (spec) {
    const definitionsSelector = [
      // re data-lt, see https://github.com/tidoust/reffy/issues/336#issuecomment-650339747
      'dfn[id]:not([data-lt=""])',
      'h2[id][data-dfn-type]:not([data-lt=""])',
      'h3[id][data-dfn-type]:not([data-lt=""])',
      'h4[id][data-dfn-type]:not([data-lt=""])',
      'h5[id][data-dfn-type]:not([data-lt=""])',
      'h6[id][data-dfn-type]:not([data-lt=""])'
    ].join(',');

    if (spec === "html") {
      preProcessHTML();
    }

    return [...document.querySelectorAll(definitionsSelector)]
      .map(definitionMapper);
  }

  function preProcessHTML() {
    // We need to extract the list of possible interfaces by parsing the WebIDL of the spec first
    const idl = window.reffy.extractWebIdl();
    const idlTree = WebIDL2.parse(idl);
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

      }    return id;
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
      if (exceptions[fullId]|| fromIdToIdl(containerid)) {
        let names = (exceptions[fullId] ? exceptions[fullId] : fromIdToIdl(containerid)).split(",");
        interfaces = idlInterfaces.filter(i => names.includes(i.name));
      }
      if (Object.keys(mixins).includes(containerid)) {
      // some container id are split across several mixins, lets find out which
        const candidateInterfaceNames = [mixins[containerid]].concat(idlTree.filter(inc => inc.type === "includes" && inc.target === mixins[containerid]).map(inc => inc.includes));
        interfaces =  candidateInterfaceNames.map(name => idlInterfaces.filter(iface => iface.name === name)).flat().filter(iface => iface && iface.members && iface.members.find(member => member.name.toLowerCase() === id));
      }

      if (interfaces.length) {
        let type = "attribute";
        let relevantInterfaces = interfaces;
        if (id) {
          type = "dfn";
          // dom-head-profile, intentionally omitted from IDL fragment
          if (id === "profile" && containerid === "head") {
            return {type: "attribute", _for:"HTMLHeadElement"};
          }
          relevantInterfaces = interfaces.filter(iface => iface.members.find(member => member.name && member.name.toLowerCase() === id));
          if (relevantInterfaces.length) {
            let idlTerm = relevantInterfaces[0].members.find(member => member.name && member.name.toLowerCase() === id);
            type = idlTerm.type === "operation" ? "method" : idlTerm.type;
          }
        }
        return {type, _for: [... new Set(relevantInterfaces.map(iface => iface.name))].join(",")};
      }

      const enumName = id => { switch(id) {
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

      // Miscellanous exceptions
      // Ideally, get this fixed upstream
      switch(containerid) {
        // not an enum, but a well-defined DOMString
      case "datatransfer-dropeffect": return {type: "dfn", _for:"DataTransfer.dropEffect"};
        // not an enum, but a well-defined DOMString
      case "datatransfer-effectallowed": return {type: "dfn", _for:"DataTransfer.effectAllowed"};
      case "document-nameditem": return {type: "dfn", _for:"Document"};
        // mode of the value attribute of the inputelement
      case "input-value":
      case "input-value-default":
        return {type: "dfn", _for:"HTMLInputElement.value"};
        // not an enum, but a well-defined DOMString
      case "texttrack-kind": return {type: "dfn", _for:"TextTrack.kind"};
        // dom-tree-accessors
      case "tree": return { type:"dfn", _for:""};
      case "window-nameditem": return {type: "dfn", _for:"Window"};
      }

      //throw "Cannot match " + containerid + " to a known IDL name (" + id + ")";
      return {type: "unknown", _for: containerid +  " with " + id};
    }

    const headingSelector = [
      'h2[id$="-element"]:not([data-dfn-type]) dfn:not([id])',
      'h3[id$="-element"]:not([data-dfn-type]) dfn:not([id])',
      'h4[id$="-element"]:not([data-dfn-type]) dfn:not([id])',
      'h5[id$="-element"]:not([data-dfn-type]) dfn:not([id])',
      'h6[id$="-element"]:not([data-dfn-type]) dfn:not([id])'
    ].join(',');

    // we copy the id on the dfn when it is set on the surrounding heading
    [...document.querySelectorAll(headingSelector)]
      .forEach(el => {
        el.id = el.closest("h2, h3, h4, h5, h6").id;
        if (el.id.match(/^the-([^-]*)-element$/)) {
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
          const globalscopes = ["Window", "WindowOrWorkerGlobalScope", "HTMLElement", "WindowSessionStorage", "WorkerGlobalScope", "WindowLocalStorage", "HTMLOrSVGElement", "ElementContentEditable"];
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
          const {type, _for} = fromIdToTypeAndFor(m[1], m[2]);
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

  /**
   * Extract the list of references from the "References" appendix of the
   * current document.
   *
   * Notes:
   * - By definition, this function does not return the specifications that
   * the current document references in the prose but failed to add to the
   * "References" appendix.
   * - The function throws when no references could be found
   *
   * @function
   * @public
   * @return {Object} An object with a "normative" and/or an "informative"
   *   property that list references as they appear in the "References".
   */
  function extractReferences () {
    const generator = getGenerator();
    const extractionRules = getExtractionRules(generator);
    const references = extractReferences$1(extractionRules);
    return references;
  }



  /**
   * Given the name of the generator used to create the document,
   * return the rules to use to extract references.
   *
   * @function
   * @private
   * @param {String} generator The well-known generator used to create the doc,
   *   null if unknown
   * @return {Object} Relevant extraction rules (or null if no rules seem to apply).
   */
  function getExtractionRules(generator) {
    const extractionRules = {
      bikeshed: {
        generator: "Bikeshed",
        listSelector: {
          normative: "#normative + dl",
          informative: "#informative + dl"
        }
      },
      respec: {
        generator: "ReSpec",
        listSelector: {
          normative: "#normative-references > dl",
          informative: "#informative-references > dl"
        }
      }
    };

    return (generator ? extractionRules[generator] : null);
  }


  /**
   * Skip next siblings until another tag with the given name is found
   *
   * @function
   * @private
   * @param {Node} node The DOM node to use as starting point
   * @param {String} name The sibling name to find
   * @return {Node} The next sibling with the given name, null if not found
   */
  function nextTag(node, name) {
    let nextEl = node.nextElementSibling;
    while(nextEl && nextEl.tagName !== name.toUpperCase()) {
      nextEl = nextEl.nextElementSibling;
    }
    return nextEl;
  }


  /**
   * Given a markup definition list, parse and return the list of references
   *
   * @function
   * @param {Node} referenceList The "dl" to parse
   * @param {Object} options Parsing options, set "filterInformative" to put
   *   references flagged as "non-normative" to a separate returned list
   * @return {Array} An array whose first item is the list of references and the
   *   second item the list of "non-normative" references (the second item is only
   *   set when "filterInformative" is set)
   */
  function parseReferences(referenceList, options) {
    var defaultRef = [], informativeRef = [];
    options = options || {};
    [].forEach.call(referenceList.querySelectorAll("dt"), function (dt) {
      var ref = {};
      ref.name = dt.textContent.replace(/[\[\] \n]/g, '');
      var desc = nextTag(dt, "dd");
      if (!desc || !ref.name) {
        return;
      }
      ref.url = desc.querySelector("a[href]") ? desc.querySelector("a[href]").href : "";
      if (options.filterInformative &&
          desc.textContent.match(/non-normative/i)) {
        return informativeRef.push(ref);
      }
      defaultRef.push(ref);
    });
    return [defaultRef, informativeRef];
  }
  const textMatch = re => n => n.textContent.match(re);

  /**
   * Extract references from generic documents that we could not associate with
   * any particular set of extraction rules.
   *
   * @function
   * @private
   * @return {Object} A list of references.
   */
  function extractReferencesWithoutRules() {
    const references = {
      normative: [],
      informative: []
    };
    const anchors = [...document.querySelectorAll("h1, h2, h3")];
    const referenceHeadings = anchors.filter(textMatch(/references/i));
    if (!referenceHeadings.length) {
      return references;
    }
    if (referenceHeadings.length > 1) {
      const normative = referenceHeadings.find(textMatch(/normative/i));
      if (normative) {
        const nList = nextTag(normative, "dl");
        if (nList) {
          references.normative = parseReferences(nList)[0];
        }
      }
      const informative = referenceHeadings.find(textMatch(/informative/i));
      if (informative) {
        const iList = nextTag(informative, "dl");
        if (iList) {
          references.informative = parseReferences(iList)[0];
        }
      }
      if (informative || normative) {
        return references;
      }
    }

    // If there are still multiple reference headings,
    // keep only the last one
    const referenceHeading = referenceHeadings.pop();
    const list = nextTag(referenceHeading, "dl");
    if (list) {
      const refs = parseReferences(list, { filterInformative: true });
      references.normative = refs[0];
      references.informative = refs[1];
    }
    return references;
  }


  /**
   * Extract references from the given document
   *
   * @function
   * @private
   * @param {Object} rules Extraction rules to use
   * @return {Object} A list of references.
   */
  function extractReferences$1(rules) {
    if (!rules) {
      return extractReferencesWithoutRules();
    }
    if (!rules.listSelector ||
        !rules.listSelector.normative) {
      throw new Error("Extraction rules for the list of references are incorrect");
    }
    const generator = rules.generator || "an unknown generator";

    const references = {
      normative: [],
      informative: []
    };
    ["normative", "informative"].forEach(function (referenceType) {
      const referenceList = document.querySelector(rules.listSelector[referenceType]);
      if (referenceList) {
        const refs = parseReferences(referenceList, {
          filterInformative: (referenceType === "normative")
        });
        references[referenceType] = references[referenceType].concat(refs[0]);
        if (referenceType === "normative") {
            references.informative = references.informative.concat(refs[1]);
        }
      }
    });

    return references;
  }

  /**
   * Return a canonicalized version of the given URL.
   *
   * By default, the canonicalized URL should represent the same resource and
   * typically de-reference to the same document (or a subpage of it).
   *
   * Canonicalization can be made a bit stronger through options, in particular
   * to canonicalize dated W3C URLs to the Latest version, and to use a list of
   * equivalent URLs (that the crawler typically generates).
   */
  function canonicalizeUrl(url, options) {
      options = options || {};

      let canon = url.replace(/^http:/, 'https:')
              .split('#')[0]
              .replace('index.html', '')
              .replace('Overview.html', '')
              .replace('cover.html', '')
              .replace(/spec.whatwg.org\/.*/, 'spec.whatwg.org/')  // subpage to main document in whatwg
              .replace(/w3.org\/TR\/(([^\/]+\/)+)[^\/]+\.[^\/]+$/, 'w3.org/TR/$1') // subpage to main document in w3c
              .replace(/w3.org\/TR\/([^\/]+)$/, 'w3.org/TR/$1/') // enforce trailing slash
              .replace(/w3c.github.io\/([^\/]+)$/, 'w3c.github.io/$1/') // enforce trailing slash for ED on GitHub
          ;

      if (options.datedToLatest) {
          canon = canon.replace(
              /w3.org\/TR\/[0-9]{4}\/[A-Z]+-(.*)-[0-9]{8}\/?/,
              'w3.org/TR/$1/');
      }

      let equivalentUrls = (options.equivalents) ? options.equivalents[canon] : null;
      if (Array.isArray(equivalentUrls)) {
          return (options.returnAlternatives ? equivalentUrls : equivalentUrls[0]);
      }
      else {
          return (equivalentUrls ? equivalentUrls : canon);
      }
  }


  function canonicalizesTo(url, refUrl, options) {
      let newOptions = {
          datedToLatest: (options ? options.datedToLatest : false),
          equivalents: (options ? options.equivalents : null),
          returnAlternatives: true
      };
      let canon = canonicalizeUrl(url, newOptions);
      return Array.isArray(refUrl) ?
          refUrl.some(u => canon.includes(u)) :
          canon.includes(refUrl);
  }

  /**
   * Extract and canonicalize absolute links of the document
   * FIXME: ⚠ Modify the DOM
  */
  function extractLinks () {
    // Ignore links from the "head" section, which either link to
    // self, the GitHub repo, the implementation report, and other
    // documents that don't need to appear in the list of references.
    [...document.querySelectorAll('.head a[href]')].forEach(n => n.href = '');
    const links = new Set([...document.querySelectorAll('a[href^=http]')]
      .map(n => canonicalizeUrl(n.href)));
    return [...links];
  }

  // Create a namespace to expose all Reffy functions if needed,
  // and expose all functions there.
  window.reffy = Object.assign(
    window.reffy || {},
    {
      getTitle,
      getGenerator,
      getLastModifiedDate,
      extractWebIdl,
      extractCSS,
      extractDefinitions,
      extractReferences,
      extractLinks,
      canonicalizeUrl,
      canonicalizesTo
    }
  );

}());
