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
   * @param {string} text
   */
  function lastLine(text) {
    const splitted = text.split("\n");
    return splitted[splitted.length - 1];
  }

  /**
   * @typedef {object} WebIDL2ErrorOptions
   * @property {"error" | "warning"} [level]
   * @property {Function} [autofix]
   *
   * @param {string} message error message
   * @param {"Syntax" | "Validation"} kind error type
   * @param {WebIDL2ErrorOptions} [options]
   */
  function error(source, position, current, message, kind, { level = "error", autofix, ruleName } = {}) {
    /**
     * @param {number} count
     */
    function sliceTokens(count) {
      return count > 0 ?
        source.slice(position, position + count) :
        source.slice(Math.max(position + count, 0), position);
    }

    function tokensToText(inputs, { precedes } = {}) {
      const text = inputs.map(t => t.trivia + t.value).join("");
      const nextToken = source[position];
      if (nextToken.type === "eof") {
        return text;
      }
      if (precedes) {
        return text + nextToken.trivia;
      }
      return text.slice(nextToken.trivia.length);
    }

    const maxTokens = 5; // arbitrary but works well enough
    const line =
      source[position].type !== "eof" ? source[position].line :
      source.length > 1 ? source[position - 1].line :
      1;

    const precedingLastLine = lastLine(
      tokensToText(sliceTokens(-maxTokens), { precedes: true })
    );

    const subsequentTokens = sliceTokens(maxTokens);
    const subsequentText = tokensToText(subsequentTokens);
    const subsequentFirstLine = subsequentText.split("\n")[0];

    const spaced = " ".repeat(precedingLastLine.length) + "^";
    const sourceContext = precedingLastLine + subsequentFirstLine + "\n" + spaced;

    const contextType = kind === "Syntax" ? "since" : "inside";
    const inSourceName = source.name ? ` in ${source.name}` : "";
    const grammaticalContext = (current && current.name) ? `, ${contextType} \`${current.partial ? "partial " : ""}${current.type} ${current.name}\`` : "";
    const context = `${kind} error at line ${line}${inSourceName}${grammaticalContext}:\n${sourceContext}`;
    return {
      message: `${context} ${message}`,
      bareMessage: message,
      context,
      line,
      sourceName: source.name,
      level,
      ruleName,
      autofix,
      input: subsequentText,
      tokens: subsequentTokens
    };
  }

  /**
   * @param {string} message error message
   */
  function syntaxError(source, position, current, message) {
    return error(source, position, current, message, "Syntax");
  }

  /**
   * @param {string} message error message
   * @param {WebIDL2ErrorOptions} [options]
   */
  function validationError(token, current, ruleName, message, options = {}) {
    options.ruleName = ruleName;
    return error(current.source, token.index, current, message, "Validation", options);
  }

  // @ts-check

  class Base {
    /**
     * @param {object} initializer
     * @param {Base["source"]} initializer.source
     * @param {Base["tokens"]} initializer.tokens
     */
    constructor({ source, tokens }) {
      Object.defineProperties(this, {
        source: { value: source },
        tokens: { value: tokens, writable: true },
        parent: { value: null, writable: true },
        this: { value: this } // useful when escaping from proxy
      });
    }

    toJSON() {
      const json = { type: undefined, name: undefined, inheritance: undefined };
      let proto = this;
      while (proto !== Object.prototype) {
        const descMap = Object.getOwnPropertyDescriptors(proto);
        for (const [key, value] of Object.entries(descMap)) {
          if (value.enumerable || value.get) {
            // @ts-ignore - allow indexing here
            json[key] = this[key];
          }
        }
        proto = Object.getPrototypeOf(proto);
      }
      return json;
    }
  }

  // @ts-check

  /**
   * @typedef {import("../productions/dictionary.js").Dictionary} Dictionary
   *
   * @param {*} idlType
   * @param {import("../validator.js").Definitions} defs
   * @param {object} [options]
   * @param {boolean} [options.useNullableInner] use when the input idlType is nullable and you want to use its inner type
   * @return {{ reference: *, dictionary: Dictionary }} the type reference that ultimately includes dictionary.
   */
  function idlTypeIncludesDictionary(idlType, defs, { useNullableInner } = {}) {
    if (!idlType.union) {
      const def = defs.unique.get(idlType.idlType);
      if (!def) {
        return;
      }
      if (def.type === "typedef") {
        const { typedefIncludesDictionary } = defs.cache;
        if (typedefIncludesDictionary.has(def)) {
          // Note that this also halts when it met indeterminate state
          // to prevent infinite recursion
          return typedefIncludesDictionary.get(def);
        }
        defs.cache.typedefIncludesDictionary.set(def, undefined); // indeterminate state
        const result = idlTypeIncludesDictionary(def.idlType, defs);
        defs.cache.typedefIncludesDictionary.set(def, result);
        if (result) {
          return {
            reference: idlType,
            dictionary: result.dictionary
          };
        }
      }
      if (def.type === "dictionary" && (useNullableInner || !idlType.nullable)) {
        return {
          reference: idlType,
          dictionary: def
        };
      }
    }
    for (const subtype of idlType.subtype) {
      const result = idlTypeIncludesDictionary(subtype, defs);
      if (result) {
        if (subtype.union) {
          return result;
        }
        return {
          reference: subtype,
          dictionary: result.dictionary
        };
      }
    }
  }

  /**
   * @param {*} dict dictionary type
   * @param {import("../validator.js").Definitions} defs
   * @return {boolean}
   */
  function dictionaryIncludesRequiredField(dict, defs) {
    if (defs.cache.dictionaryIncludesRequiredField.has(dict)) {
      return defs.cache.dictionaryIncludesRequiredField.get(dict);
    }
    defs.cache.dictionaryIncludesRequiredField.set(dict, undefined); // indeterminate
    if (dict.inheritance) {
      const superdict = defs.unique.get(dict.inheritance);
      if (!superdict) {
        return true;
      }
      if (dictionaryIncludesRequiredField(superdict, defs)) {
        return true;
      }
    }
    const result = dict.members.some(field => field.required);
    defs.cache.dictionaryIncludesRequiredField.set(dict, result);
    return result;
  }

  // @ts-check

  class ArrayBase extends Array {
    constructor({ source, tokens }) {
      super();
      Object.defineProperties(this, {
        source: { value: source },
        tokens: { value: tokens },
        parent: { value: null, writable: true }
      });
    }
  }

  // @ts-check

  class Token extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     * @param {string} type
     */
    static parser(tokeniser, type) {
      return () => {
        const value = tokeniser.consume(type);
        if (value) {
          return new Token({ source: tokeniser.source, tokens: { value } });
        }
      };
    }

    get value() {
      return unescape(this.tokens.value.value);
    }
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   * @param {string} tokenName
   */
  function tokens(tokeniser, tokenName) {
    return list(tokeniser, {
      parser: Token.parser(tokeniser, tokenName),
      listName: tokenName + " list"
    });
  }

  const extAttrValueSyntax = ["identifier", "decimal", "integer", "string"];

  const shouldBeLegacyPrefixed = [
    "NoInterfaceObject",
    "LenientSetter",
    "LenientThis",
    "TreatNonObjectAsNull",
    "Unforgeable",
  ];

  const renamedLegacies = new Map([
    ...shouldBeLegacyPrefixed.map(name => [name, `Legacy${name}`]),
    ["NamedConstructor", "LegacyFactoryFunction"],
    ["OverrideBuiltins", "LegacyOverrideBuiltIns"],
    ["TreatNullAs", "LegacyNullToEmptyString"],
  ]);

  /**
   * This will allow a set of extended attribute values to be parsed.
   * @param {import("../tokeniser").Tokeniser} tokeniser
   */
  function extAttrListItems(tokeniser) {
    for (const syntax of extAttrValueSyntax) {
      const toks = tokens(tokeniser, syntax);
      if (toks.length) {
        return toks;
      }
    }
    tokeniser.error(`Expected identifiers, strings, decimals, or integers but none found`);
  }


  class ExtendedAttributeParameters extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const tokens = { assign: tokeniser.consume("=") };
      const ret = autoParenter(new ExtendedAttributeParameters({ source: tokeniser.source, tokens }));
      if (tokens.assign) {
        tokens.secondaryName = tokeniser.consume(...extAttrValueSyntax);
      }
      tokens.open = tokeniser.consume("(");
      if (tokens.open) {
        ret.list = ret.rhsIsList ?
          // [Exposed=(Window,Worker)]
          extAttrListItems(tokeniser) :
          // [LegacyFactoryFunction=Audio(DOMString src)] or [Constructor(DOMString str)]
          argument_list(tokeniser);
        tokens.close = tokeniser.consume(")") || tokeniser.error("Unexpected token in extended attribute argument list");
      } else if (ret.hasRhs && !tokens.secondaryName) {
        tokeniser.error("No right hand side to extended attribute assignment");
      }
      return ret.this;
    }

    get rhsIsList() {
      return this.tokens.assign && !this.tokens.secondaryName;
    }

    get rhsType() {
      if (this.rhsIsList) {
        return this.list[0].tokens.value.type + "-list";
      }
      if (this.tokens.secondaryName) {
        return this.tokens.secondaryName.type;
      }
      return null;
    }
  }

  class SimpleExtendedAttribute extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const name = tokeniser.consume("identifier");
      if (name) {
        return new SimpleExtendedAttribute({
          source: tokeniser.source,
          tokens: { name },
          params: ExtendedAttributeParameters.parse(tokeniser)
        });
      }
    }

    constructor({ source, tokens, params }) {
      super({ source, tokens });
      params.parent = this;
      Object.defineProperty(this, "params", { value: params });
    }

    get type() {
      return "extended-attribute";
    }
    get name() {
      return this.tokens.name.value;
    }
    get rhs() {
      const { rhsType: type, tokens, list } = this.params;
      if (!type) {
        return null;
      }
      const value = this.params.rhsIsList ? list : unescape(tokens.secondaryName.value);
      return { type, value };
    }
    get arguments() {
      const { rhsIsList, list } = this.params;
      if (!list || rhsIsList) {
        return [];
      }
      return list;
    }

    *validate(defs) {
      const { name } = this;
      if (name === "LegacyNoInterfaceObject") {
        const message = `\`[LegacyNoInterfaceObject]\` extended attribute is an \
undesirable feature that may be removed from Web IDL in the future. Refer to the \
[relevant upstream PR](https://github.com/heycam/webidl/pull/609) for more \
information.`;
        yield validationError(this.tokens.name, this, "no-nointerfaceobject", message, { level: "warning" });
      } else if (renamedLegacies.has(name)) {
        const message = `\`[${name}]\` extended attribute is a legacy feature \
that is now renamed to \`[${renamedLegacies.get(name)}]\`. Refer to the \
[relevant upstream PR](https://github.com/heycam/webidl/pull/870) for more \
information.`;
        yield validationError(this.tokens.name, this, "renamed-legacy", message, {
          level: "warning",
          autofix: renameLegacyExtendedAttribute(this)
        });
      }
      for (const arg of this.arguments) {
        yield* arg.validate(defs);
      }
    }
  }

  /**
   * @param {SimpleExtendedAttribute} extAttr
   */
  function renameLegacyExtendedAttribute(extAttr) {
    return () => {
      const { name } = extAttr;
      extAttr.tokens.name.value = renamedLegacies.get(name);
      if (name === "TreatNullAs") {
        extAttr.params.tokens = {};
      }
    };
  }

  // Note: we parse something simpler than the official syntax. It's all that ever
  // seems to be used
  class ExtendedAttributes extends ArrayBase {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const tokens = {};
      tokens.open = tokeniser.consume("[");
      if (!tokens.open) return new ExtendedAttributes({});
      const ret = new ExtendedAttributes({ source: tokeniser.source, tokens });
      ret.push(...list(tokeniser, {
        parser: SimpleExtendedAttribute.parse,
        listName: "extended attribute"
      }));
      tokens.close = tokeniser.consume("]") || tokeniser.error("Unexpected closing token of extended attribute");
      if (!ret.length) {
        tokeniser.error("Found an empty extended attribute");
      }
      if (tokeniser.probe("[")) {
        tokeniser.error("Illegal double extended attribute lists, consider merging them");
      }
      return ret;
    }

    *validate(defs) {
      for (const extAttr of this) {
        yield* extAttr.validate(defs);
      }
    }
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   * @param {string} typeName
   */
  function generic_type(tokeniser, typeName) {
    const base = tokeniser.consume("FrozenArray", "Promise", "sequence", "record");
    if (!base) {
      return;
    }
    const ret = autoParenter(new Type({ source: tokeniser.source, tokens: { base } }));
    ret.tokens.open = tokeniser.consume("<") || tokeniser.error(`No opening bracket after ${base.type}`);
    switch (base.type) {
      case "Promise": {
        if (tokeniser.probe("[")) tokeniser.error("Promise type cannot have extended attribute");
        const subtype = return_type(tokeniser, typeName) || tokeniser.error("Missing Promise subtype");
        ret.subtype.push(subtype);
        break;
      }
      case "sequence":
      case "FrozenArray": {
        const subtype = type_with_extended_attributes(tokeniser, typeName) || tokeniser.error(`Missing ${base.type} subtype`);
        ret.subtype.push(subtype);
        break;
      }
      case "record": {
        if (tokeniser.probe("[")) tokeniser.error("Record key cannot have extended attribute");
        const keyType = tokeniser.consume(...stringTypes) || tokeniser.error(`Record key must be one of: ${stringTypes.join(", ")}`);
        const keyIdlType = new Type({ source: tokeniser.source, tokens: { base: keyType }});
        keyIdlType.tokens.separator = tokeniser.consume(",") || tokeniser.error("Missing comma after record key type");
        keyIdlType.type = typeName;
        const valueType = type_with_extended_attributes(tokeniser, typeName) || tokeniser.error("Error parsing generic type record");
        ret.subtype.push(keyIdlType, valueType);
        break;
      }
    }
    if (!ret.idlType) tokeniser.error(`Error parsing generic type ${base.type}`);
    ret.tokens.close = tokeniser.consume(">") || tokeniser.error(`Missing closing bracket after ${base.type}`);
    return ret.this;
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   */
  function type_suffix(tokeniser, obj) {
    const nullable = tokeniser.consume("?");
    if (nullable) {
      obj.tokens.nullable = nullable;
    }
    if (tokeniser.probe("?")) tokeniser.error("Can't nullable more than once");
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   * @param {string} typeName
   */
  function single_type(tokeniser, typeName) {
    let ret = generic_type(tokeniser, typeName) || primitive_type(tokeniser);
    if (!ret) {
      const base = tokeniser.consume("identifier", ...stringTypes, ...typeNameKeywords);
      if (!base) {
        return;
      }
      ret = new Type({ source: tokeniser.source, tokens: { base } });
      if (tokeniser.probe("<")) tokeniser.error(`Unsupported generic type ${base.value}`);
    }
    if (ret.generic === "Promise" && tokeniser.probe("?")) {
      tokeniser.error("Promise type cannot be nullable");
    }
    ret.type = typeName || null;
    type_suffix(tokeniser, ret);
    if (ret.nullable && ret.idlType === "any") tokeniser.error("Type `any` cannot be made nullable");
    return ret;
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   * @param {string} type
   */
  function union_type(tokeniser, type) {
    const tokens = {};
    tokens.open = tokeniser.consume("(");
    if (!tokens.open) return;
    const ret = autoParenter(new Type({ source: tokeniser.source, tokens }));
    ret.type = type || null;
    while (true) {
      const typ = type_with_extended_attributes(tokeniser) || tokeniser.error("No type after open parenthesis or 'or' in union type");
      if (typ.idlType === "any") tokeniser.error("Type `any` cannot be included in a union type");
      if (typ.generic === "Promise") tokeniser.error("Type `Promise` cannot be included in a union type");
      ret.subtype.push(typ);
      const or = tokeniser.consume("or");
      if (or) {
        typ.tokens.separator = or;
      }
      else break;
    }
    if (ret.idlType.length < 2) {
      tokeniser.error("At least two types are expected in a union type but found less");
    }
    tokens.close = tokeniser.consume(")") || tokeniser.error("Unterminated union type");
    type_suffix(tokeniser, ret);
    return ret.this;
  }

  class Type extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     * @param {string} typeName
     */
    static parse(tokeniser, typeName) {
      return single_type(tokeniser, typeName) || union_type(tokeniser, typeName);
    }

    constructor({ source, tokens }) {
      super({ source, tokens });
      Object.defineProperty(this, "subtype", { value: [], writable: true });
      this.extAttrs = new ExtendedAttributes({});
    }

    get generic() {
      if (this.subtype.length && this.tokens.base) {
        return this.tokens.base.value;
      }
      return "";
    }
    get nullable() {
      return Boolean(this.tokens.nullable);
    }
    get union() {
      return Boolean(this.subtype.length) && !this.tokens.base;
    }
    get idlType() {
      if (this.subtype.length) {
        return this.subtype;
      }
      // Adding prefixes/postfixes for "unrestricted float", etc.
      const name = [
        this.tokens.prefix,
        this.tokens.base,
        this.tokens.postfix
      ].filter(t => t).map(t => t.value).join(" ");
      return unescape(name);
    }

    *validate(defs) {
      yield* this.extAttrs.validate(defs);
      /*
       * If a union is nullable, its subunions cannot include a dictionary
       * If not, subunions may include dictionaries if each union is not nullable
       */
      const typedef = !this.union && defs.unique.get(this.idlType);
      const target =
        this.union ? this :
        (typedef && typedef.type === "typedef") ? typedef.idlType :
        undefined;
      if (target && this.nullable) {
        // do not allow any dictionary
        const { reference } = idlTypeIncludesDictionary(target, defs) || {};
        if (reference) {
          const targetToken = (this.union ? reference : this).tokens.base;
          const message = `Nullable union cannot include a dictionary type`;
          yield validationError(targetToken, this, "no-nullable-union-dict", message);
        }
      } else {
        // allow some dictionary
        for (const subtype of this.subtype) {
          yield* subtype.validate(defs);
        }
      }
    }
  }

  class Default extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const assign = tokeniser.consume("=");
      if (!assign) {
        return null;
      }
      const def = const_value(tokeniser) || tokeniser.consume("string", "null", "[", "{") || tokeniser.error("No value for default");
      const expression = [def];
      if (def.type === "[") {
        const close = tokeniser.consume("]") || tokeniser.error("Default sequence value must be empty");
        expression.push(close);
      } else if (def.type === "{") {
        const close = tokeniser.consume("}") || tokeniser.error("Default dictionary value must be empty");
        expression.push(close);
      }
      return new Default({ source: tokeniser.source, tokens: { assign }, expression });
    }

    constructor({ source, tokens, expression }) {
      super({ source, tokens });
      expression.parent = this;
      Object.defineProperty(this, "expression", { value: expression });
    }

    get type() {
      return const_data(this.expression[0]).type;
    }
    get value() {
      return const_data(this.expression[0]).value;
    }
    get negative() {
      return const_data(this.expression[0]).negative;
    }
  }

  // @ts-check

  class Argument extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const start_position = tokeniser.position;
      /** @type {Base["tokens"]} */
      const tokens = {};
      const ret = autoParenter(new Argument({ source: tokeniser.source, tokens }));
      ret.extAttrs = ExtendedAttributes.parse(tokeniser);
      tokens.optional = tokeniser.consume("optional");
      ret.idlType = type_with_extended_attributes(tokeniser, "argument-type");
      if (!ret.idlType) {
        return tokeniser.unconsume(start_position);
      }
      if (!tokens.optional) {
        tokens.variadic = tokeniser.consume("...");
      }
      tokens.name = tokeniser.consume("identifier", ...argumentNameKeywords);
      if (!tokens.name) {
        return tokeniser.unconsume(start_position);
      }
      ret.default = tokens.optional ? Default.parse(tokeniser) : null;
      return ret.this;
    }

    get type() {
      return "argument";
    }
    get optional() {
      return !!this.tokens.optional;
    }
    get variadic() {
      return !!this.tokens.variadic;
    }
    get name() {
      return unescape(this.tokens.name.value);
    }

    /**
     * @param {import("../validator.js").Definitions} defs
     */
    *validate(defs) {
      yield* this.idlType.validate(defs);
      const result = idlTypeIncludesDictionary(this.idlType, defs, { useNullableInner: true });
      if (result) {
        if (this.idlType.nullable) {
          const message = `Dictionary arguments cannot be nullable.`;
          yield validationError(this.tokens.name, this, "no-nullable-dict-arg", message);
        } else if (!this.optional) {
          if (this.parent && !dictionaryIncludesRequiredField(result.dictionary, defs) && isLastRequiredArgument(this)) {
            const message = `Dictionary argument must be optional if it has no required fields`;
            yield validationError(this.tokens.name, this, "dict-arg-optional", message, {
              autofix: autofixDictionaryArgumentOptionality(this)
            });
          }
        } else if (!this.default) {
          const message = `Optional dictionary arguments must have a default value of \`{}\`.`;
          yield validationError(this.tokens.name, this, "dict-arg-default", message, {
            autofix: autofixOptionalDictionaryDefaultValue(this)
          });
        }
      }
    }
  }

  /**
   * @param {Argument} arg
   */
  function isLastRequiredArgument(arg) {
    const list = arg.parent.arguments || arg.parent.list;
    const index = list.indexOf(arg);
    const requiredExists = list.slice(index + 1).some(a => !a.optional);
    return !requiredExists;
  }

  /**
   * @param {Argument} arg
   */
  function autofixDictionaryArgumentOptionality(arg) {
    return () => {
      const firstToken = getFirstToken(arg.idlType);
      arg.tokens.optional = { type: "optional", value: "optional", trivia: firstToken.trivia };
      firstToken.trivia = " ";
      autofixOptionalDictionaryDefaultValue(arg)();
    };
  }

  /**
   * @param {Argument} arg
   */
  function autofixOptionalDictionaryDefaultValue(arg) {
    return () => {
      arg.default = Default.parse(new Tokeniser(" = {}"));
    };
  }

  class Operation extends Base {
    /**
     * @typedef {import("../tokeniser.js").Token} Token
     *
     * @param {import("../tokeniser.js").Tokeniser} tokeniser
     * @param {object} [options]
     * @param {Token} [options.special]
     * @param {Token} [options.regular]
     */
    static parse(tokeniser, { special, regular } = {}) {
      const tokens = { special };
      const ret = autoParenter(new Operation({ source: tokeniser.source, tokens }));
      if (special && special.value === "stringifier") {
        tokens.termination = tokeniser.consume(";");
        if (tokens.termination) {
          ret.arguments = [];
          return ret;
        }
      }
      if (!special && !regular) {
        tokens.special = tokeniser.consume("getter", "setter", "deleter");
      }
      ret.idlType = return_type(tokeniser) || tokeniser.error("Missing return type");
      tokens.name = tokeniser.consume("identifier", "includes");
      tokens.open = tokeniser.consume("(") || tokeniser.error("Invalid operation");
      ret.arguments = argument_list(tokeniser);
      tokens.close = tokeniser.consume(")") || tokeniser.error("Unterminated operation");
      tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated operation, expected `;`");
      return ret.this;
    }

    get type() {
      return "operation";
    }
    get name() {
      const { name } = this.tokens;
      if (!name) {
        return "";
      }
      return unescape(name.value);
    }
    get special() {
      if (!this.tokens.special) {
        return "";
      }
      return this.tokens.special.value;
    }

    *validate(defs) {
      if (!this.name && ["", "static"].includes(this.special)) {
        const message = `Regular or static operations must have both a return type and an identifier.`;
        yield validationError(this.tokens.open, this, "incomplete-op", message);
      }
      if (this.idlType) {
        yield* this.idlType.validate(defs);
      }
      for (const argument of this.arguments) {
        yield* argument.validate(defs);
      }
    }
  }

  class Attribute extends Base {
    /**
     * @param {import("../tokeniser.js").Tokeniser} tokeniser
     */
    static parse(tokeniser, { special, noInherit = false, readonly = false } = {}) {
      const start_position = tokeniser.position;
      const tokens = { special };
      const ret = autoParenter(new Attribute({ source: tokeniser.source, tokens }));
      if (!special && !noInherit) {
        tokens.special = tokeniser.consume("inherit");
      }
      if (ret.special === "inherit" && tokeniser.probe("readonly")) {
        tokeniser.error("Inherited attributes cannot be read-only");
      }
      tokens.readonly = tokeniser.consume("readonly");
      if (readonly && !tokens.readonly && tokeniser.probe("attribute")) {
        tokeniser.error("Attributes must be readonly in this context");
      }
      tokens.base = tokeniser.consume("attribute");
      if (!tokens.base) {
        tokeniser.unconsume(start_position);
        return;
      }
      ret.idlType = type_with_extended_attributes(tokeniser, "attribute-type") || tokeniser.error("Attribute lacks a type");
      switch (ret.idlType.generic) {
        case "sequence":
        case "record": tokeniser.error(`Attributes cannot accept ${ret.idlType.generic} types`);
      }
      tokens.name = tokeniser.consume("identifier", "async", "required") || tokeniser.error("Attribute lacks a name");
      tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated attribute, expected `;`");
      return ret.this;
    }

    get type() {
      return "attribute";
    }
    get special() {
      if (!this.tokens.special) {
        return "";
      }
      return this.tokens.special.value;
    }
    get readonly() {
      return !!this.tokens.readonly;
    }
    get name() {
      return unescape(this.tokens.name.value);
    }

    *validate(defs) {
      yield* this.extAttrs.validate(defs);
      yield* this.idlType.validate(defs);
    }
  }

  /**
   * @param {string} identifier
   */
  function unescape(identifier) {
    return identifier.startsWith('_') ? identifier.slice(1) : identifier;
  }

  /**
   * Parses comma-separated list
   * @param {import("../tokeniser").Tokeniser} tokeniser
   * @param {object} args
   * @param {Function} args.parser parser function for each item
   * @param {boolean} [args.allowDangler] whether to allow dangling comma
   * @param {string} [args.listName] the name to be shown on error messages
   */
  function list(tokeniser, { parser, allowDangler, listName = "list" }) {
    const first = parser(tokeniser);
    if (!first) {
      return [];
    }
    first.tokens.separator = tokeniser.consume(",");
    const items = [first];
    while (first.tokens.separator) {
      const item = parser(tokeniser);
      if (!item) {
        if (!allowDangler) {
          tokeniser.error(`Trailing comma in ${listName}`);
        }
        break;
      }
      item.tokens.separator = tokeniser.consume(",");
      items.push(item);
      if (!item.tokens.separator) break;
    }
    return items;
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   */
  function const_value(tokeniser) {
    return tokeniser.consume("true", "false", "Infinity", "-Infinity", "NaN", "decimal", "integer");
  }

  /**
   * @param {object} token
   * @param {string} token.type
   * @param {string} token.value
   */
  function const_data({ type, value }) {
    switch (type) {
      case "true":
      case "false":
        return { type: "boolean", value: type === "true" };
      case "Infinity":
      case "-Infinity":
        return { type: "Infinity", negative: type.startsWith("-") };
      case "[":
        return { type: "sequence", value: [] };
      case "{":
        return { type: "dictionary" };
      case "decimal":
      case "integer":
        return { type: "number", value };
      case "string":
        return { type: "string", value: value.slice(1, -1) };
      default:
        return { type };
    }
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   */
  function primitive_type(tokeniser) {
    function integer_type() {
      const prefix = tokeniser.consume("unsigned");
      const base = tokeniser.consume("short", "long");
      if (base) {
        const postfix = tokeniser.consume("long");
        return new Type({ source, tokens: { prefix, base, postfix } });
      }
      if (prefix) tokeniser.error("Failed to parse integer type");
    }

    function decimal_type() {
      const prefix = tokeniser.consume("unrestricted");
      const base = tokeniser.consume("float", "double");
      if (base) {
        return new Type({ source, tokens: { prefix, base } });
      }
      if (prefix) tokeniser.error("Failed to parse float type");
    }

    const { source } = tokeniser;
    const num_type = integer_type() || decimal_type();
    if (num_type) return num_type;
    const base = tokeniser.consume("boolean", "byte", "octet");
    if (base) {
      return new Type({ source, tokens: { base } });
    }
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   */
  function argument_list(tokeniser) {
    return list(tokeniser, { parser: Argument.parse, listName: "arguments list" });
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   * @param {string} typeName
   */
  function type_with_extended_attributes(tokeniser, typeName) {
    const extAttrs = ExtendedAttributes.parse(tokeniser);
    const ret = Type.parse(tokeniser, typeName);
    if (ret) autoParenter(ret).extAttrs = extAttrs;
    return ret;
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   * @param {string} typeName
   */
  function return_type(tokeniser, typeName) {
    const typ = Type.parse(tokeniser, typeName || "return-type");
    if (typ) {
      return typ;
    }
    const voidToken = tokeniser.consume("void");
    if (voidToken) {
      const ret = new Type({ source: tokeniser.source, tokens: { base: voidToken } });
      ret.type = "return-type";
      return ret;
    }
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   */
  function stringifier(tokeniser) {
    const special = tokeniser.consume("stringifier");
    if (!special) return;
    const member = Attribute.parse(tokeniser, { special }) ||
      Operation.parse(tokeniser, { special }) ||
      tokeniser.error("Unterminated stringifier");
    return member;
  }

  /**
   * @param {string} str
   */
  function getLastIndentation(str) {
    const lines = str.split("\n");
    // the first line visually binds to the preceding token
    if (lines.length) {
      const match = lines[lines.length - 1].match(/^\s+/);
      if (match) {
        return match[0];
      }
    }
    return "";
  }

  /**
   * @param {string} parentTrivia
   */
  function getMemberIndentation(parentTrivia) {
    const indentation = getLastIndentation(parentTrivia);
    const indentCh = indentation.includes("\t") ? "\t" : "  ";
    return indentation + indentCh;
  }

  /**
   * @param {object} def
   * @param {import("./extended-attributes.js").ExtendedAttributes} def.extAttrs
   */
  function autofixAddExposedWindow(def) {
    return () => {
      if (def.extAttrs.length){
        const tokeniser = new Tokeniser("Exposed=Window,");
        const exposed = SimpleExtendedAttribute.parse(tokeniser);
        exposed.tokens.separator = tokeniser.consume(",");
        const existing = def.extAttrs[0];
        if (!/^\s/.test(existing.tokens.name.trivia)) {
          existing.tokens.name.trivia = ` ${existing.tokens.name.trivia}`;
        }
        def.extAttrs.unshift(exposed);
      } else {
        autoParenter(def).extAttrs = ExtendedAttributes.parse(new Tokeniser("[Exposed=Window]"));
        const trivia = def.tokens.base.trivia;
        def.extAttrs.tokens.open.trivia = trivia;
        def.tokens.base.trivia = `\n${getLastIndentation(trivia)}`;
      }
    };
  }

  /**
   * Get the first syntax token for the given IDL object.
   * @param {*} data
   */
  function getFirstToken(data) {
    if (data.extAttrs.length) {
      return data.extAttrs.tokens.open;
    }
    if (data.type === "operation" && !data.special) {
      return getFirstToken(data.idlType);
    }
    const tokens = Object.values(data.tokens).sort((x, y) => x.index - y.index);
    return tokens[0];
  }

  /**
   * @template T
   * @param {T[]} array
   * @param {(item: T) => boolean} predicate
   */
  function findLastIndex(array, predicate) {
    const index = array.slice().reverse().findIndex(predicate);
    if (index === -1) {
      return index;
    }
    return array.length - index - 1;
  }

  /**
   * Returns a proxy that auto-assign `parent` field.
   * @template T
   * @param {T} data
   * @param {*} [parent] The object that will be assigned to `parent`.
   *                     If absent, it will be `data` by default.
   * @return {T}
   */
  function autoParenter(data, parent) {
    if (!parent) {
      // Defaults to `data` unless specified otherwise.
      parent = data;
    }
    if (!data) {
      // This allows `autoParenter(undefined)` which again allows
      // `autoParenter(parse())` where the function may return nothing.
      return data;
    }
    return new Proxy(data, {
      get(target, p) {
        const value = target[p];
        if (Array.isArray(value)) {
          // Wraps the array so that any added items will also automatically
          // get their `parent` values.
          return autoParenter(value, target);
        }
        return value;
      },
      set(target, p, value) {
        target[p] = value;
        if (!value) {
          return true;
        } else if (Array.isArray(value)) {
          // Assigning an array will add `parent` to its items.
          for (const item of value) {
            if (typeof item.parent !== "undefined") {
              item.parent = parent;
            }
          }
        } else if (typeof value.parent !== "undefined") {
          value.parent = parent;
        }
        return true;
      }
    });
  }

  // These regular expressions use the sticky flag so they will only match at
  // the current location (ie. the offset of lastIndex).
  const tokenRe = {
    // This expression uses a lookahead assertion to catch false matches
    // against integers early.
    "decimal": /-?(?=[0-9]*\.|[0-9]+[eE])(([0-9]+\.[0-9]*|[0-9]*\.[0-9]+)([Ee][-+]?[0-9]+)?|[0-9]+[Ee][-+]?[0-9]+)/y,
    "integer": /-?(0([Xx][0-9A-Fa-f]+|[0-7]*)|[1-9][0-9]*)/y,
    "identifier": /[_-]?[A-Za-z][0-9A-Z_a-z-]*/y,
    "string": /"[^"]*"/y,
    "whitespace": /[\t\n\r ]+/y,
    "comment": /((\/(\/.*|\*([^*]|\*[^/])*\*\/)[\t\n\r ]*)+)/y,
    "other": /[^\t\n\r 0-9A-Za-z]/y
  };

  const typeNameKeywords = [
    "ArrayBuffer",
    "DataView",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Uint8Array",
    "Uint16Array",
    "Uint32Array",
    "Uint8ClampedArray",
    "Float32Array",
    "Float64Array",
    "any",
    "object",
    "symbol"
  ];

  const stringTypes = [
    "ByteString",
    "DOMString",
    "USVString"
  ];

  const argumentNameKeywords = [
    "async",
    "attribute",
    "callback",
    "const",
    "constructor",
    "deleter",
    "dictionary",
    "enum",
    "getter",
    "includes",
    "inherit",
    "interface",
    "iterable",
    "maplike",
    "namespace",
    "partial",
    "required",
    "setlike",
    "setter",
    "static",
    "stringifier",
    "typedef",
    "unrestricted"
  ];

  const nonRegexTerminals = [
    "-Infinity",
    "FrozenArray",
    "Infinity",
    "NaN",
    "Promise",
    "boolean",
    "byte",
    "double",
    "false",
    "float",
    "long",
    "mixin",
    "null",
    "octet",
    "optional",
    "or",
    "readonly",
    "record",
    "sequence",
    "short",
    "true",
    "unsigned",
    "void"
  ].concat(argumentNameKeywords, stringTypes, typeNameKeywords);

  const punctuations = [
    "(",
    ")",
    ",",
    "...",
    ":",
    ";",
    "<",
    "=",
    ">",
    "?",
    "[",
    "]",
    "{",
    "}"
  ];

  const reserved = [
    // "constructor" is now a keyword
    "_constructor",
    "toString",
    "_toString",
  ];

  /**
   * @typedef {ArrayItemType<ReturnType<typeof tokenise>>} Token
   * @param {string} str
   */
  function tokenise(str) {
    const tokens = [];
    let lastCharIndex = 0;
    let trivia = "";
    let line = 1;
    let index = 0;
    while (lastCharIndex < str.length) {
      const nextChar = str.charAt(lastCharIndex);
      let result = -1;

      if (/[\t\n\r ]/.test(nextChar)) {
        result = attemptTokenMatch("whitespace", { noFlushTrivia: true });
      } else if (nextChar === '/') {
        result = attemptTokenMatch("comment", { noFlushTrivia: true });
      }

      if (result !== -1) {
        const currentTrivia = tokens.pop().value;
        line += (currentTrivia.match(/\n/g) || []).length;
        trivia += currentTrivia;
        index -= 1;
      } else if (/[-0-9.A-Z_a-z]/.test(nextChar)) {
        result = attemptTokenMatch("decimal");
        if (result === -1) {
          result = attemptTokenMatch("integer");
        }
        if (result === -1) {
          result = attemptTokenMatch("identifier");
          const lastIndex = tokens.length - 1;
          const token = tokens[lastIndex];
          if (result !== -1) {
            if (reserved.includes(token.value)) {
              const message = `${unescape(token.value)} is a reserved identifier and must not be used.`;
              throw new WebIDLParseError(syntaxError(tokens, lastIndex, null, message));
            } else if (nonRegexTerminals.includes(token.value)) {
              token.type = token.value;
            }
          }
        }
      } else if (nextChar === '"') {
        result = attemptTokenMatch("string");
      }

      for (const punctuation of punctuations) {
        if (str.startsWith(punctuation, lastCharIndex)) {
          tokens.push({ type: punctuation, value: punctuation, trivia, line, index });
          trivia = "";
          lastCharIndex += punctuation.length;
          result = lastCharIndex;
          break;
        }
      }

      // other as the last try
      if (result === -1) {
        result = attemptTokenMatch("other");
      }
      if (result === -1) {
        throw new Error("Token stream not progressing");
      }
      lastCharIndex = result;
      index += 1;
    }

    // remaining trivia as eof
    tokens.push({
      type: "eof",
      value: "",
      trivia
    });

    return tokens;

    /**
     * @param {keyof typeof tokenRe} type
     * @param {object} options
     * @param {boolean} [options.noFlushTrivia]
     */
    function attemptTokenMatch(type, { noFlushTrivia } = {}) {
      const re = tokenRe[type];
      re.lastIndex = lastCharIndex;
      const result = re.exec(str);
      if (result) {
        tokens.push({ type, value: result[0], trivia, line, index });
        if (!noFlushTrivia) {
          trivia = "";
        }
        return re.lastIndex;
      }
      return -1;
    }
  }

  class Tokeniser {
    /**
     * @param {string} idl
     */
    constructor(idl) {
      this.source = tokenise(idl);
      this.position = 0;
    }

    /**
     * @param {string} message
     * @return {never}
     */
    error(message) {
      throw new WebIDLParseError(syntaxError(this.source, this.position, this.current, message));
    }

    /**
     * @param {string} type
     */
    probe(type) {
      return this.source.length > this.position && this.source[this.position].type === type;
    }

    /**
     * @param  {...string} candidates
     */
    consume(...candidates) {
      for (const type of candidates) {
        if (!this.probe(type)) continue;
        const token = this.source[this.position];
        this.position++;
        return token;
      }
    }

    /**
     * @param {number} position
     */
    unconsume(position) {
      this.position = position;
    }
  }

  class WebIDLParseError extends Error {
    /**
     * @param {object} options
     * @param {string} options.message
     * @param {string} options.bareMessage
     * @param {string} options.context
     * @param {number} options.line
     * @param {*} options.sourceName
     * @param {string} options.input
     * @param {*[]} options.tokens
     */
    constructor({ message, bareMessage, context, line, sourceName, input, tokens }) {
      super(message);

      this.name = "WebIDLParseError"; // not to be mangled
      this.bareMessage = bareMessage;
      this.context = context;
      this.line = line;
      this.sourceName = sourceName;
      this.input = input;
      this.tokens = tokens;
    }
  }

  class EnumValue extends Token {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const value = tokeniser.consume("string");
      if (value) {
        return new EnumValue({ source: tokeniser.source, tokens: { value } });
      }
    }

    get type() {
      return "enum-value";
    }
    get value() {
      return super.value.slice(1, -1);
    }
  }

  class Enum extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      /** @type {Base["tokens"]} */
      const tokens = {};
      tokens.base = tokeniser.consume("enum");
      if (!tokens.base) {
        return;
      }
      tokens.name = tokeniser.consume("identifier") || tokeniser.error("No name for enum");
      const ret = autoParenter(new Enum({ source: tokeniser.source, tokens }));
      tokeniser.current = ret.this;
      tokens.open = tokeniser.consume("{") || tokeniser.error("Bodyless enum");
      ret.values = list(tokeniser, {
        parser: EnumValue.parse,
        allowDangler: true,
        listName: "enumeration"
      });
      if (tokeniser.probe("string")) {
        tokeniser.error("No comma between enum values");
      }
      tokens.close = tokeniser.consume("}") || tokeniser.error("Unexpected value in enum");
      if (!ret.values.length) {
        tokeniser.error("No value in enum");
      }
      tokens.termination = tokeniser.consume(";") || tokeniser.error("No semicolon after enum");
      return ret.this;
    }

    get type() {
      return "enum";
    }
    get name() {
      return unescape(this.tokens.name.value);
    }
  }

  // @ts-check

  class Includes extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const target = tokeniser.consume("identifier");
      if (!target) {
        return;
      }
      const tokens = { target };
      tokens.includes = tokeniser.consume("includes");
      if (!tokens.includes) {
        tokeniser.unconsume(target.index);
        return;
      }
      tokens.mixin = tokeniser.consume("identifier") || tokeniser.error("Incomplete includes statement");
      tokens.termination = tokeniser.consume(";") || tokeniser.error("No terminating ; for includes statement");
      return new Includes({ source: tokeniser.source, tokens });
    }

    get type() {
      return "includes";
    }
    get target() {
      return unescape(this.tokens.target.value);
    }
    get includes() {
      return unescape(this.tokens.mixin.value);
    }
  }

  class Typedef extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      /** @type {Base["tokens"]} */
      const tokens = {};
      const ret = autoParenter(new Typedef({ source: tokeniser.source, tokens }));
      tokens.base = tokeniser.consume("typedef");
      if (!tokens.base) {
        return;
      }
      ret.idlType = type_with_extended_attributes(tokeniser, "typedef-type") || tokeniser.error("Typedef lacks a type");
      tokens.name = tokeniser.consume("identifier") || tokeniser.error("Typedef lacks a name");
      tokeniser.current = ret.this;
      tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated typedef, expected `;`");
      return ret.this;
    }

    get type() {
      return "typedef";
    }
    get name() {
      return unescape(this.tokens.name.value);
    }

    *validate(defs) {
      yield* this.idlType.validate(defs);
    }
  }

  class CallbackFunction extends Base {
    /**
     * @param {import("../tokeniser.js").Tokeniser} tokeniser
     */
    static parse(tokeniser, base) {
      const tokens = { base };
      const ret = autoParenter(new CallbackFunction({ source: tokeniser.source, tokens }));
      tokens.name = tokeniser.consume("identifier") || tokeniser.error("Callback lacks a name");
      tokeniser.current = ret.this;
      tokens.assign = tokeniser.consume("=") || tokeniser.error("Callback lacks an assignment");
      ret.idlType = return_type(tokeniser) || tokeniser.error("Callback lacks a return type");
      tokens.open = tokeniser.consume("(") || tokeniser.error("Callback lacks parentheses for arguments");
      ret.arguments = argument_list(tokeniser);
      tokens.close = tokeniser.consume(")") || tokeniser.error("Unterminated callback");
      tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated callback, expected `;`");
      return ret.this;
    }

    get type() {
      return "callback";
    }
    get name() {
      return unescape(this.tokens.name.value);
    }

    *validate(defs) {
      yield* this.extAttrs.validate(defs);
      yield* this.idlType.validate(defs);
    }
  }

  /**
   * @param {import("../tokeniser.js").Tokeniser} tokeniser
   */
  function inheritance(tokeniser) {
    const colon = tokeniser.consume(":");
    if (!colon) {
      return {};
    }
    const inheritance = tokeniser.consume("identifier") || tokeniser.error("Inheritance lacks a type");
    return { colon, inheritance };
  }

  class Container extends Base {
      /**
       * @template T
       * @param {import("../tokeniser.js").Tokeniser} tokeniser
       * @param {T} instance
       * @param {*} args
       */
      static parse(tokeniser, instance, { type, inheritable, allowedMembers }) {
        const { tokens } = instance;
        tokens.name = tokeniser.consume("identifier") || tokeniser.error(`Missing name in ${instance.type}`);
        tokeniser.current = instance;
        instance = autoParenter(instance);
        if (inheritable) {
          Object.assign(tokens, inheritance(tokeniser));
        }
        tokens.open = tokeniser.consume("{") || tokeniser.error(`Bodyless ${type}`);
        instance.members = [];
        while (true) {
          tokens.close = tokeniser.consume("}");
          if (tokens.close) {
            tokens.termination = tokeniser.consume(";") || tokeniser.error(`Missing semicolon after ${type}`);
            return instance.this;
          }
          const ea = ExtendedAttributes.parse(tokeniser);
          let mem;
          for (const [parser, ...args] of allowedMembers) {
            mem = autoParenter(parser(tokeniser, ...args));
            if (mem) {
              break;
            }
          }
          if (!mem) {
            tokeniser.error("Unknown member");
          }
          mem.extAttrs = ea;
          instance.members.push(mem.this);
        }
      }

      get partial() {
        return !!this.tokens.partial;
      }
      get name() {
        return unescape(this.tokens.name.value);
      }
      get inheritance() {
        if (!this.tokens.inheritance) {
          return null;
        }
        return unescape(this.tokens.inheritance.value);
      }

      *validate(defs) {
        for (const member of this.members) {
          if (member.validate) {
            yield* member.validate(defs);
          }
        }
      }
    }

  class Constant extends Base {
    /**
     * @param {import("../tokeniser.js").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      /** @type {Base["tokens"]} */
      const tokens = {};
      tokens.base = tokeniser.consume("const");
      if (!tokens.base) {
        return;
      }
      let idlType = primitive_type(tokeniser);
      if (!idlType) {
        const base = tokeniser.consume("identifier") || tokeniser.error("Const lacks a type");
        idlType = new Type({ source: tokeniser.source, tokens: { base } });
      }
      if (tokeniser.probe("?")) {
        tokeniser.error("Unexpected nullable constant type");
      }
      idlType.type = "const-type";
      tokens.name = tokeniser.consume("identifier") || tokeniser.error("Const lacks a name");
      tokens.assign = tokeniser.consume("=") || tokeniser.error("Const lacks value assignment");
      tokens.value = const_value(tokeniser) || tokeniser.error("Const lacks a value");
      tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated const, expected `;`");
      const ret = new Constant({ source: tokeniser.source, tokens });
      autoParenter(ret).idlType = idlType;
      return ret;
    }

    get type() {
      return "const";
    }
    get name() {
      return unescape(this.tokens.name.value);
    }
    get value() {
      return const_data(this.tokens.value);
    }
  }

  class IterableLike extends Base {
    /**
     * @param {import("../tokeniser.js").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const start_position = tokeniser.position;
      const tokens = {};
      const ret = autoParenter(new IterableLike({ source: tokeniser.source, tokens }));
      tokens.readonly = tokeniser.consume("readonly");
      if (!tokens.readonly) {
        tokens.async = tokeniser.consume("async");
      }
      tokens.base =
        tokens.readonly ? tokeniser.consume("maplike", "setlike") :
        tokens.async ? tokeniser.consume("iterable") :
        tokeniser.consume("iterable", "maplike", "setlike");
      if (!tokens.base) {
        tokeniser.unconsume(start_position);
        return;
      }

      const { type } = ret;
      const secondTypeRequired = type === "maplike";
      const secondTypeAllowed = secondTypeRequired || type === "iterable";
      const argumentAllowed = ret.async && type === "iterable";

      tokens.open = tokeniser.consume("<") || tokeniser.error(`Missing less-than sign \`<\` in ${type} declaration`);
      const first = type_with_extended_attributes(tokeniser) || tokeniser.error(`Missing a type argument in ${type} declaration`);
      ret.idlType = [first];
      ret.arguments = [];

      if (secondTypeAllowed) {
        first.tokens.separator = tokeniser.consume(",");
        if (first.tokens.separator) {
          ret.idlType.push(type_with_extended_attributes(tokeniser));
        }
        else if (secondTypeRequired) {
          tokeniser.error(`Missing second type argument in ${type} declaration`);
        }
      }

      tokens.close = tokeniser.consume(">") || tokeniser.error(`Missing greater-than sign \`>\` in ${type} declaration`);

      if (tokeniser.probe("(")) {
        if (argumentAllowed) {
          tokens.argsOpen = tokeniser.consume("(");
          ret.arguments.push(...argument_list(tokeniser));
          tokens.argsClose = tokeniser.consume(")") || tokeniser.error("Unterminated async iterable argument list");
        } else {
          tokeniser.error(`Arguments are only allowed for \`async iterable\``);
        }
      }

      tokens.termination = tokeniser.consume(";") || tokeniser.error(`Missing semicolon after ${type} declaration`);

      return ret.this;
    }

    get type() {
      return this.tokens.base.value;
    }
    get readonly() {
      return !!this.tokens.readonly;
    }
    get async() {
      return !!this.tokens.async;
    }

    *validate(defs) {
      for (const type of this.idlType) {
        yield* type.validate(defs);
      }
      for (const argument of this.arguments) {
        yield* argument.validate(defs);
      }
    }
  }

  // @ts-check

  function* checkInterfaceMemberDuplication(defs, i) {
    const opNames = new Set(getOperations(i).map(op => op.name));
    const partials = defs.partials.get(i.name) || [];
    const mixins = defs.mixinMap.get(i.name) || [];
    for (const ext of [...partials, ...mixins]) {
      const additions = getOperations(ext);
      yield* forEachExtension(additions, opNames, ext, i);
      for (const addition of additions) {
        opNames.add(addition.name);
      }
    }

    function* forEachExtension(additions, existings, ext, base) {
      for (const addition of additions) {
        const { name } = addition;
        if (name && existings.has(name)) {
          const message = `The operation "${name}" has already been defined for the base interface "${base.name}" either in itself or in a mixin`;
          yield validationError(addition.tokens.name, ext, "no-cross-overload", message);
        }
      }
    }

    function getOperations(i) {
      return i.members
        .filter(({type}) => type === "operation");
    }
  }

  class Constructor extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      const base = tokeniser.consume("constructor");
      if (!base) {
        return;
      }
      /** @type {Base["tokens"]} */
      const tokens = { base };
      tokens.open = tokeniser.consume("(") || tokeniser.error("No argument list in constructor");
      const args = argument_list(tokeniser);
      tokens.close = tokeniser.consume(")") || tokeniser.error("Unterminated constructor");
      tokens.termination = tokeniser.consume(";") || tokeniser.error("No semicolon after constructor");
      const ret = new Constructor({ source: tokeniser.source, tokens });
      autoParenter(ret).arguments = args;
      return ret;
    }

    get type() {
      return "constructor";
    }

    *validate(defs) {
      if (this.idlType) {
        yield* this.idlType.validate(defs);
      }
      for (const argument of this.arguments) {
        yield* argument.validate(defs);
      }
    }
  }

  /**
   * @param {import("../tokeniser").Tokeniser} tokeniser
   */
  function static_member(tokeniser) {
    const special = tokeniser.consume("static");
    if (!special) return;
    const member = Attribute.parse(tokeniser, { special }) ||
      Operation.parse(tokeniser, { special }) ||
      tokeniser.error("No body in static member");
    return member;
  }

  class Interface extends Container {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser, base, { partial = null } = {}) {
      const tokens = { partial, base };
      return Container.parse(tokeniser, new Interface({ source: tokeniser.source, tokens }), {
        type: "interface",
        inheritable: !partial,
        allowedMembers: [
          [Constant.parse],
          [Constructor.parse],
          [static_member],
          [stringifier],
          [IterableLike.parse],
          [Attribute.parse],
          [Operation.parse]
        ]
      });
    }

    get type() {
      return "interface";
    }

    *validate(defs) {
      yield* this.extAttrs.validate(defs);
      if (
        !this.partial &&
        this.extAttrs.every(extAttr => extAttr.name !== "Exposed") &&
        this.extAttrs.every(extAttr => extAttr.name !== "LegacyNoInterfaceObject")
      ) {
        const message = `Interfaces must have \`[Exposed]\` extended attribute. \
To fix, add, for example, \`[Exposed=Window]\`. Please also consider carefully \
if your interface should also be exposed in a Worker scope. Refer to the \
[WebIDL spec section on Exposed](https://heycam.github.io/webidl/#Exposed) \
for more information.`;
        yield validationError(this.tokens.name, this, "require-exposed", message, {
          autofix: autofixAddExposedWindow(this)
        });
      }
      const oldConstructors = this.extAttrs.filter(extAttr => extAttr.name === "Constructor");
      for (const constructor of oldConstructors) {
        const message = `Constructors should now be represented as a \`constructor()\` operation on the interface \
instead of \`[Constructor]\` extended attribute. Refer to the \
[WebIDL spec section on constructor operations](https://heycam.github.io/webidl/#idl-constructors) \
for more information.`;
        yield validationError(constructor.tokens.name, this, "constructor-member", message, {
          autofix: autofixConstructor(this, constructor)
        });
      }

      const isGlobal = this.extAttrs.some(extAttr => extAttr.name === "Global");
      if (isGlobal) {
        const factoryFunctions = this.extAttrs.filter(extAttr => extAttr.name === "LegacyFactoryFunction");
        for (const named of factoryFunctions) {
          const message = `Interfaces marked as \`[Global]\` cannot have factory functions.`;
          yield validationError(named.tokens.name, this, "no-constructible-global", message);
        }

        const constructors = this.members.filter(member => member.type === "constructor");
        for (const named of constructors) {
          const message = `Interfaces marked as \`[Global]\` cannot have constructors.`;
          yield validationError(named.tokens.base, this, "no-constructible-global", message);
        }
      }

      yield* super.validate(defs);
      if (!this.partial) {
        yield* checkInterfaceMemberDuplication(defs, this);
      }
    }
  }

  function autofixConstructor(interfaceDef, constructorExtAttr) {
    interfaceDef = autoParenter(interfaceDef);
    return () => {
      const indentation = getLastIndentation(interfaceDef.extAttrs.tokens.open.trivia);
      const memberIndent = interfaceDef.members.length ?
        getLastIndentation(getFirstToken(interfaceDef.members[0]).trivia) :
        getMemberIndentation(indentation);
      const constructorOp = Constructor.parse(new Tokeniser(`\n${memberIndent}constructor();`));
      constructorOp.extAttrs = new ExtendedAttributes({});
      autoParenter(constructorOp).arguments = constructorExtAttr.arguments;

      const existingIndex = findLastIndex(interfaceDef.members, m => m.type === "constructor");
      interfaceDef.members.splice(existingIndex + 1, 0, constructorOp);

      const { close }  = interfaceDef.tokens;
      if (!close.trivia.includes("\n")) {
        close.trivia += `\n${indentation}`;
      }

      const { extAttrs } = interfaceDef;
      const index = extAttrs.indexOf(constructorExtAttr);
      const removed = extAttrs.splice(index, 1);
      if (!extAttrs.length) {
        extAttrs.tokens.open = extAttrs.tokens.close = undefined;
      } else if (extAttrs.length === index) {
        extAttrs[index - 1].tokens.separator = undefined;
      } else if (!extAttrs[index].tokens.name.trivia.trim()) {
        extAttrs[index].tokens.name.trivia = removed[0].tokens.name.trivia;
      }
    };
  }

  class Mixin extends Container {
    /**
     * @typedef {import("../tokeniser.js").Token} Token
     *
     * @param {import("../tokeniser.js").Tokeniser} tokeniser
     * @param {Token} base
     * @param {object} [options]
     * @param {Token} [options.partial]
     */
    static parse(tokeniser, base, { partial } = {}) {
      const tokens = { partial, base };
      tokens.mixin = tokeniser.consume("mixin");
      if (!tokens.mixin) {
        return;
      }
      return Container.parse(tokeniser, new Mixin({ source: tokeniser.source, tokens }), {
        type: "interface mixin",
        allowedMembers: [
          [Constant.parse],
          [stringifier],
          [Attribute.parse, { noInherit: true }],
          [Operation.parse, { regular: true }]
        ]
      });
    }

    get type() {
      return "interface mixin";
    }
  }

  class Field extends Base {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser) {
      /** @type {Base["tokens"]} */
      const tokens = {};
      const ret = autoParenter(new Field({ source: tokeniser.source, tokens }));
      ret.extAttrs = ExtendedAttributes.parse(tokeniser);
      tokens.required = tokeniser.consume("required");
      ret.idlType = type_with_extended_attributes(tokeniser, "dictionary-type") || tokeniser.error("Dictionary member lacks a type");
      tokens.name = tokeniser.consume("identifier") || tokeniser.error("Dictionary member lacks a name");
      ret.default = Default.parse(tokeniser);
      if (tokens.required && ret.default) tokeniser.error("Required member must not have a default");
      tokens.termination = tokeniser.consume(";") || tokeniser.error("Unterminated dictionary member, expected `;`");
      return ret.this;
    }

    get type() {
      return "field";
    }
    get name() {
      return unescape(this.tokens.name.value);
    }
    get required() {
      return !!this.tokens.required;
    }

    *validate(defs) {
      yield* this.idlType.validate(defs);
    }
  }

  // @ts-check

  class Dictionary extends Container {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     * @param {object} [options]
     * @param {import("../tokeniser.js").Token} [options.partial]
     */
    static parse(tokeniser, { partial } = {}) {
      const tokens = { partial };
      tokens.base = tokeniser.consume("dictionary");
      if (!tokens.base) {
        return;
      }
      return Container.parse(tokeniser, new Dictionary({ source: tokeniser.source, tokens }), {
        type: "dictionary",
        inheritable: !partial,
        allowedMembers: [
          [Field.parse],
        ]
      });
    }

    get type() {
      return "dictionary";
    }
  }

  class Namespace extends Container {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     * @param {object} [options]
     * @param {import("../tokeniser.js").Token} [options.partial]
     */
    static parse(tokeniser, { partial } = {}) {
      const tokens = { partial };
      tokens.base = tokeniser.consume("namespace");
      if (!tokens.base) {
        return;
      }
      return Container.parse(tokeniser, new Namespace({ source: tokeniser.source, tokens }), {
        type: "namespace",
        allowedMembers: [
          [Attribute.parse, { noInherit: true, readonly: true }],
          [Operation.parse, { regular: true }]
        ]
      });
    }

    get type() {
      return "namespace";
    }

    *validate(defs) {
      if (!this.partial && this.extAttrs.every(extAttr => extAttr.name !== "Exposed")) {
        const message = `Namespaces must have [Exposed] extended attribute. \
To fix, add, for example, [Exposed=Window]. Please also consider carefully \
if your namespace should also be exposed in a Worker scope. Refer to the \
[WebIDL spec section on Exposed](https://heycam.github.io/webidl/#Exposed) \
for more information.`;
        yield validationError(this.tokens.name, this, "require-exposed", message, {
          autofix: autofixAddExposedWindow(this)
        });
      }
      yield* super.validate(defs);
    }
  }

  // @ts-check

  class CallbackInterface extends Container {
    /**
     * @param {import("../tokeniser").Tokeniser} tokeniser
     */
    static parse(tokeniser, callback, { partial = null } = {}) {
      const tokens = { callback };
      tokens.base = tokeniser.consume("interface");
      if (!tokens.base) {
        return;
      }
      return Container.parse(tokeniser, new CallbackInterface({ source: tokeniser.source, tokens }), {
        type: "callback interface",
        inheritable: !partial,
        allowedMembers: [
          [Constant.parse],
          [Operation.parse, { regular: true }]
        ]
      });
    }

    get type() {
      return "callback interface";
    }
  }

  /**
   * @param {Tokeniser} tokeniser
   * @param {object} options
   * @param {boolean} [options.concrete]
   */
  function parseByTokens(tokeniser, options) {
    const source = tokeniser.source;

    function error(str) {
      tokeniser.error(str);
    }

    function consume(...candidates) {
      return tokeniser.consume(...candidates);
    }

    function callback() {
      const callback = consume("callback");
      if (!callback) return;
      if (tokeniser.probe("interface")) {
        return CallbackInterface.parse(tokeniser, callback);
      }
      return CallbackFunction.parse(tokeniser, callback);
    }

    function interface_(opts) {
      const base = consume("interface");
      if (!base) return;
      const ret = Mixin.parse(tokeniser, base, opts) ||
        Interface.parse(tokeniser, base, opts) ||
        error("Interface has no proper body");
      return ret;
    }

    function partial() {
      const partial = consume("partial");
      if (!partial) return;
      return Dictionary.parse(tokeniser, { partial }) ||
        interface_({ partial }) ||
        Namespace.parse(tokeniser, { partial }) ||
        error("Partial doesn't apply to anything");
    }

    function definition() {
      return callback() ||
        interface_() ||
        partial() ||
        Dictionary.parse(tokeniser) ||
        Enum.parse(tokeniser) ||
        Typedef.parse(tokeniser) ||
        Includes.parse(tokeniser) ||
        Namespace.parse(tokeniser);
    }

    function definitions() {
      if (!source.length) return [];
      const defs = [];
      while (true) {
        const ea = ExtendedAttributes.parse(tokeniser);
        const def = definition();
        if (!def) {
          if (ea.length) error("Stray extended attributes");
          break;
        }
        autoParenter(def).extAttrs = ea;
        defs.push(def);
      }
      const eof = consume("eof");
      if (options.concrete) {
        defs.push(eof);
      }
      return defs;
    }
    const res = definitions();
    if (tokeniser.position < source.length) error("Unrecognised tokens");
    return res;
  }

  /**
   * @param {string} str
   * @param {object} [options]
   * @param {*} [options.sourceName]
   * @param {boolean} [options.concrete]
   */
  function parse(str, options = {}) {
    const tokeniser = new Tokeniser(str);
    if (typeof options.sourceName !== "undefined") {
      tokeniser.source.name = options.sourceName;
    }
    return parseByTokens(tokeniser, options);
  }

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
    switch (spec) {
    case "html":
      preProcessHTML();
      break;
    case "SVG2":
      preProcessSVG2();
      break;
    }

    return [...document.querySelectorAll(definitionsSelector)]
      .map(definitionMapper);
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

      // Miscellanous exceptions
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
      return {type: "unknown", _for: containerid +  " with " + id};
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
   * Extract and canonicalize absolute links of the document and their fragments
   * FIXME: ⚠ Modify the DOM
  */
  function extractLinks () {
    // Ignore links from the "head" section, which either link to
    // self, the GitHub repo, the implementation report, and other
    // documents that don't need to appear in the list of references.
    const links = {};
    [...document.querySelectorAll('.head a[href]')].forEach(n => n.href = '');
    document.querySelectorAll('a[href^=http]').forEach(n => {
      const url = canonicalizeUrl(n.href);
      if (!links[url]) {
        links[url] = new Set();
      }
      if (n.href.includes('#') && n.href.split('#')[1]) {
        links[url].add(n.href.split('#')[1]);
      }
    });
    return Object.keys(links)
    // turning sets into arrays
      .reduce((acc, u) => {
        acc[u] = [...links[u]];
        return acc;
    }, {});
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
