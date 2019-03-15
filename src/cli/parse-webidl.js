#!/usr/bin/env node
/**
 * The WebIDL parser takes the URL of a spec as input and outputs a JSON
 * structure that describes the WebIDL term definitions and references that the
 * spec contains.
 *
 * The WebIDL parser uses the [WebIDL extractor]{@link module:webidlExtractor}
 * to fetch and extract the WebIDL definitions contained in the given spec, and
 * analyzes that spec with [WebIDL2]{@link
 * https://github.com/darobin/webidl2.js}
 *
 * The WebIDL parser can be called directly through:
 *
 * `node parse-webidl.js [url]`
 *
 * where `url` is the URL of the spec to fetch and parse.
 *
 * @module webidlParser
 */

const WebIDL2 = require("webidl2");


/**
 * Update obsolete WebIDL constructs to make them compatible with latest
 * version of WebIDL
 */
function normalizeWebIDL1to2(idl) {
    return idl
        // Use "FrozenArray" instead of "[]"
        .replace(/attribute +([^\[ ]*)\[\]/g, "attribute FrozenArray<$1>")

        // Use the default toJSON operation instead of serializers
        .replace(/serializer\s*=\s*{[^}]*}/g, "[Default] object toJSON()");
}


/**
 * Checks whether the given IDL uses WebIDL Level 1 constructs that are no
 * longer valid in WebIDL Level 2.
 *
 * Note a smarter method would typically return the list of obsolete constructs
 * instead of just a boolean flag. To be considered...
 *
 * @function
 * @public
 * @param {String} idl IDL content to check
 * @return {boolean} True when the IDL string contains obsolete constructs,
 *   false otherwise.
 */
function hasObsoleteIdl(idl) {
    return (idl !== normalizeWebIDL1to2(idl));
}


/**
 * Main method that takes IDL definitions and parses that IDL to compute
 * the list of internal/external dependencies.
 *
 * @function
 * @public
 * @param {String} idl IDL content, typically returned by the WebIDL extractor
 * @return {Promise} The promise to a parsed IDL structure that includes
 *   information about dependencies, both at the interface level and at the
 *   global level.
 */
function parse(idl) {
    idl = normalizeWebIDL1to2(idl);
    return new Promise(function (resolve, reject) {
        var idlTree;
        var jsNames = {constructors: {}, functions: {}, objects:{}};
        var idlNames = {
            // List of dependencies per interface
            _dependencies: {},

            // Flag set when the IDL really depends on "Window", meaning when
            // "Window" appears as a dependency elsewhere than in
            // "Exposed=Window" statements.
            // (This is being tracked because "Window" is considered to be an
            // exception to the rule: in theory, "Exposed=Window" triggers the
            // need to add a normative reference to HTML, but that is overkill
            // in practice so Reffy will only warn about the missing reference
            // when "Window" appears as a dependency in other statements)
            _reallyDependsOnWindow: false
        };
        var idlExtendedNames = {};
        var externalDependencies = [];
        try {
            idlTree = WebIDL2.parse(idl);
        } catch (e) {
            return reject(e);
        }
        idlTree.forEach(parseIdlAstTree(jsNames, idlNames, idlExtendedNames, externalDependencies));
        externalDependencies = externalDependencies.filter(n => !idlNames[n]);
        replaceFakePrimaryGlobal(jsNames.primaryGlobal, jsNames);

        // TODO: consider outputting information about PrimaryGlobal and Global
        // interfaces defined by the IDL as well.
        if (jsNames.primaryGlobal) {
            delete jsNames.primaryGlobal;
        }

        resolve({jsNames, idlNames, idlExtendedNames, externalDependencies});
    });
}


/**
 * Function that generates a parsing method that may be applied to nodes of
 * the IDL AST tree generated by the webidl2 and that completes the tree
 * structure with dependencies information.
 *
 * Note that the method recursively calls itself when it parses interfaces or
 * dictionaries.
 *
 * @function
 * @private
 * @param {Object} jsNames The set of interfaces that are visible from the
 *   JavaScript code, per context, either through Constructors or because they
 *   are exposed by some function or object.
 * @param {Object} idlNames The set of interfaces and other constructs that the
 *   IDL content defines.
 * @param {Object} idlExtendedNames The set of interfaces that the
 *   IDL content extends, typically through "partial" definitions
 * @param {Array(String)} externalDependencies The set of IDL names that the IDL
 *   content makes use of and that it does not define
 * @param {String} contextName The current interface context, used to compute
 *   dependencies at the interface level
 * @return A function that can be applied to all nodes of an IDL AST tree and
 *   that fills up the above sets.
 */
function parseIdlAstTree(jsNames, idlNames, idlExtendedNames, externalDependencies, contextName) {
    return function (def) {
        switch(def.type) {
        case "namespace":
        case "interface":
        case "interface mixin":
        case "dictionary":
        case "callback interface":
            parseInterfaceOrDictionary(def, jsNames, idlNames, idlExtendedNames, externalDependencies);
            break;
        case "enum":
            idlNames[def.name] = def;
            break;
        case "operation":
            if (def.stringifier) return;
            parseType(def.idlType, idlNames, externalDependencies, contextName);
            def.arguments.forEach(a => parseType(a.idlType,  idlNames, externalDependencies, contextName));
            break;
        case "attribute":
        case "field":
            parseType(def.idlType, idlNames, externalDependencies, contextName);
          break;
        case "includes":
        case "implements":
            parseType(def.target, idlNames, externalDependencies);
            parseType(def[def.type], idlNames, externalDependencies);
            if (def[def.type] === 'window') {
                idlNames._reallyDependsOnWindow = true;
            }
            if (!idlNames._dependencies[def.target]) {
                idlNames._dependencies[def.target] = [];
            }
            addDependency(def[def.type], {}, idlNames._dependencies[def.target]);
            break;
        case "typedef":
            parseType(def.idlType, idlNames, externalDependencies);
            idlNames[def.name] = def;
            break;
        case "callback":
            idlNames[def.name] = def;
            def.arguments.forEach(a => parseType(a.idlType,  idlNames, externalDependencies));
            break;
        case "iterable":
        case "setlike":
        case "maplike":
            var type = def.idlType;
            if (!Array.isArray(type)) {
                type = [def.idlType];
            }
            type.forEach(a => parseType(a, idlNames, externalDependencies, contextName));
            break;
        case "serializer":
        case "stringifier":
        case "const":
        case "eof":
            break;
        default:
            console.error("Unhandled IDL type: " + def.type + " in " +JSON.stringify(def));
        }
    };
}


/**
 * Parse an IDL AST node that defines an interface or dictionary, and compute
 * dependencies information.
 *
 * @function
 * @private
 * @param {Object} def The IDL AST node to parse
 * @see parseIdlAstTree for other parameters
 * @return {void} The function updates the contents of its parameters and does
 *   not return anything
 */
function parseInterfaceOrDictionary(def, jsNames, idlNames, idlExtendedNames, externalDependencies) {
    if (!idlNames._dependencies[def.name]) {
        idlNames._dependencies[def.name] = [];
    }
    if (def.partial) {
        if (!idlExtendedNames[def.name]) {
            idlExtendedNames[def.name] = [];
        }
        idlExtendedNames[def.name].push(def);
        if (def.name === 'window') {
            idlNames._reallyDependsOnWindow = true;
        }
        addDependency(def.name, idlNames, externalDependencies);
    } else {
        if (def.inheritance) {
            if (def.implements === 'window') {
                idlNames._reallyDependsOnWindow = true;
            }
            addDependency(def.inheritance, idlNames, externalDependencies);
            addDependency(def.inheritance, {}, idlNames._dependencies[def.name]);
        }
        idlNames[def.name] = def;
        var extendedAttributesHasReferences = ea => ["Exposed", "Global", "PrimaryGlobal"].includes(ea.name);
        def.extAttrs.filter(extendedAttributesHasReferences).forEach(ea => {
            var contexts = [];
            if (ea.name === "PrimaryGlobal") {
                // We just found the primary global interface
                if (ea.rhs && (ea.rhs.type === "identifier")) {
                    jsNames.primaryGlobal = ea.rhs.value;
                }
                else {
                    jsNames.primaryGlobal = def.name;
                }
            }
            if ((ea.name === "Global" || ea.name === "PrimaryGlobal")
                && ea.rhs && (ea.rhs.type === "identifier" || ea.rhs.type === "identifier-list")) {
                const globalNames = ea.rhs.type === "identifier" ? [ea.rhs.value] : ea.rhs.value;
                globalNames.forEach(n => idlNames[n] = [def.name]);
                // record ea.rhs.value as "known"
            } else { // Exposed
                if (ea.rhs) {
                    if (ea.rhs.type === "identifier") {
                        contexts = [ea.rhs.value];
                    } else {
                        contexts = ea.rhs.value;
                    }
                }
                contexts.forEach(c => {
                    addDependency(c, idlNames, externalDependencies);
                    addDependency(c, {}, idlNames._dependencies[def.name], def.name);
                });
            }
        });
        if (def.extAttrs.some(ea => ea.name === "Constructor")) {
            addToJSContext(def.extAttrs, jsNames, def.name, "constructors");
            def.extAttrs.filter(ea => ea.name === "Constructor").forEach(function(constructor) {
                if (constructor.arguments) {
                    constructor.arguments.forEach(a => parseType(a.idlType, idlNames, externalDependencies, def.name));
                }
            });
        } else if (def.extAttrs.some(ea => ea.name === "NamedConstructor")) {
            def.extAttrs.filter(ea => ea.name === "NamedConstructor").forEach(function(constructor) {
                idlNames[constructor.rhs.value] = constructor;
                addToJSContext(def.extAttrs, jsNames, def.name, "constructors");
                if (constructor.arguments) {
                    constructor.arguments.forEach(a => parseType(a.idlType, idlNames, externalDependencies, def.name));
                }
            });
        } else if (def.type === "interface") {
            if (!def.extAttrs.some(ea => ea.name === "NoInterfaceObject")) {
                addToJSContext(def.extAttrs, jsNames, def.name, "functions");
            }
        }
    }
    def.members.forEach(parseIdlAstTree(jsNames, idlNames, idlExtendedNames, externalDependencies, def.name));
}


/**
 * Add the given IDL name to the set of objects that are exposed to JS, for the
 * right contexts.
 *
 * @function
 * @private
 * @param {Object} eas The extended attributes that may qualify that IDL name
 * @param {Object} jsNames See parseIdlAstTree params
 * @param {String} name The IDL name to add to the jsNames set
 * @param {String} type The type of exposure (constructor, function, object)
 * @return {void} The function updates jsNames
 */
function addToJSContext(eas, jsNames, name, type) {
    var contexts = ["[PrimaryGlobal]"];
    var exposed = eas && eas.some(ea => ea.name === "Exposed");
    if (exposed) {
        var exposedEa = eas.find(ea => ea.name === "Exposed");
        if (exposedEa.rhs.type === "identifier") {
            contexts = [exposedEa.rhs.value];
        } else {
            contexts = exposedEa.rhs.value;
        }
    }
    contexts.forEach(c => { if (!jsNames[type][c]) jsNames[type][c] = []; jsNames[type][c].push(name)});
}


/**
 * Parse the given IDL type and update external dependencies accordingly
 *
 * @function
 * @private
 * @param {Object} idltype The IDL AST node that defines/references the type
 * @see parseIdlAstTree for other parameters
 * @return {void} The function updates externalDependencies
 */
function parseType(idltype, idlNames, externalDependencies, contextName) {
    // For some reasons, webidl2 sometimes returns the name of the IDL type
    // instead of an IDL construct for array constructs. For example:
    //  Constructor(DOMString[] urls) interface toto;
    // ... will create an array IDL node that directly point to "DOMString" and
    // not to a node that describes the "DOMString" type.
    if (isString(idltype)) {
        idltype = { idlType: 'DOMString' };
    }
    if (idltype.union || (idltype.generic && Array.isArray(idltype.idlType))) {
        idltype.idlType.forEach(t => parseType(t, idlNames, externalDependencies, contextName));
        return;
    }
    if (idltype.sequence || idltype.array || idltype.generic) {
        parseType(idltype.idlType, idlNames, externalDependencies, contextName);
        return;
    }
    var wellKnownTypes = ["void", "any", "boolean", "byte", "octet", "short", "unsigned short", "long", "unsigned long", "long long", "unsigned long long", "float", "unrestricted float", "double", "unrestricted double", "DOMString", "ByteString", "USVString", "object",
                          "RegExp", "Error", "DOMException", "ArrayBuffer", "DataView", "Int8Array", "Int16Array", "Int32Array", "Uint8Array", "Uint16Array", "Uint32Array", "Uint8ClampedArray", "Float32Array", "Float64Array",
                          "ArrayBufferView", "BufferSource", "DOMTimeStamp", "Function", "VoidFunction"];
    if (wellKnownTypes.indexOf(idltype.idlType) === -1) {
        if (idltype.idlType === 'window') {
            idlNames._reallyDependsOnWindow = true;
        }
        addDependency(idltype.idlType, idlNames, externalDependencies);
        if (contextName) {
            addDependency(idltype.idlType, {}, idlNames._dependencies[contextName]);
        }
    }
}


/**
 * Returns true if given object is a String
 *
 * @function
 * @private
 * @param {any} obj The object to test
 * @return {bool} true is object is a String, false otherwise
 */
function isString(obj) {
    return Object.prototype.toString.call(obj) === '[object String]';
}


/**
 * Add the given name to the list of external dependencies, unless it already
 * appears in the set of IDL names defined by the IDL content
 *
 * @function
 * @private
 * @param {String} name The IDL name to consider as a potential external dependency
 * @param {Array(String)} idlNames The set of IDL names set by the IDL content
 * @param {Array(String)} externalDependencies The set of external dependencies
 * @return {void} The function updates externalDependencies as needed
 */
function addDependency(name, idlNames, externalDependencies) {
    if ((Object.keys(idlNames).indexOf(name) === -1) &&
        (externalDependencies.indexOf(name) === -1)) {
        externalDependencies.push(name);
    }
}


/**
 * Merge IDL names defined with an [Exposed] extended attribute that points to
 * the primary global interface and those that are defined with no [Exposed]
 * keyword
 *
 * NB: In the absence of an interface defined with the [PrimaryGlobal] extended
 * attribute, the function assumes that the IDL content is to be understood in
 * a Web context and thus that the primary global interface is called "Window".
 *
 * @function
 * @private
 * @param {String} primaryGlobal The name of the primary global interface,
 *   meaning the one defined with a [PrimaryGlobal] extended attribute, if any.
 * @param {Object} jsNames The set of interfaces that are visible from the
 *   JavaScript code, per context, either through Constructors or because they
 *   are exposed by some function or object.
 * @return {Object} The updated set of interfaces, where interfaces that were
 *   initially attached to a pseudo '[PrimaryGlobal]' name are now attached to
 *   the actual primary global interface. Note the object is updated in place.
 */
function replaceFakePrimaryGlobal(primaryGlobal, jsNames) {
    const defaultPrimaryGlobal = '[PrimaryGlobal]';
    primaryGlobal = primaryGlobal || 'Window';
    Object.keys(jsNames).forEach(key => {
        const contexts = jsNames[key];
        if (key === 'primaryGlobal') {
            return;
        }
        if (contexts[primaryGlobal] || contexts[defaultPrimaryGlobal]) {
            contexts[primaryGlobal] = (contexts[primaryGlobal] || [])
                .concat(contexts[defaultPrimaryGlobal] || []);
            if (contexts[defaultPrimaryGlobal]) {
                delete contexts[defaultPrimaryGlobal];
            }
        }
    });
    return jsNames;
}


/**************************************************
Export the parse method for use as module
**************************************************/
module.exports.parse = parse;
module.exports.hasObsoleteIdl = hasObsoleteIdl;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    var url = process.argv[2];
    if (!url) {
        console.error("Required URL parameter missing");
        process.exit(2);
    }
    var webidlExtract = require("./extract-webidl");
    webidlExtract.extract(url)
        .then(parse)
        .then(function (data) {
            console.log(JSON.stringify(data, null, 2));
        })
        .catch(function (err) {
            console.error(err, err.stack);
            process.exit(64);
        });
}
