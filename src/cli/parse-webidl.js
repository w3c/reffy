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
 * Serialize an IDL AST node to a JSON object that contains both a textual
 * serialization of the IDL fragment and a tree serialization of the AST node
 *
 * @function
 * @private
 * @param {Object} def The parsed IDL node returned by the webidl2.js parser
 * @return {Object} An object with a "value" and "parsedValue" properties
 */
function serialize(def) {
    return Object.assign(
        { fragment: WebIDL2.write([def]).trim() },
        JSON.parse(JSON.stringify(def)));
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
        var idlReport = {
            // List of names available to global interfaces, either as
            // objects that can be constructed or as objects that can be
            // returned from functions
            jsNames: {
                constructors: {},
                functions: {}
            },

            // List of IDL names defined in the IDL content, indexed by name
            idlNames: {},

            // List of partial IDL name definitions, indexed by name
            idlExtendedNames: {},

            // List of globals defined by the IDL content and the name of the
            // underlying interfaces (e.g. { "Worker":
            // ["DedicatedWorkerGlobalScope", "SharedWorkerGlobalScope"] })
            globals: {},

            // List of globals on which interfaces are defined, along with the
            // name of the underlying interfaces (e.g. { "Window":
            // ["ServiceWorker", "ServiceWorkerRegistration", ...]})
            exposed: {},

            // List of dependencies (both internal and external) per interface
            dependencies: {},

            // IDL names referenced by the IDL content but defined elsewhere
            externalDependencies: []
        };
        try {
            idlTree = WebIDL2.parse(idl);
        } catch (e) {
            return reject(e);
        }
        idlTree.forEach(parseIdlAstTree(idlReport));
        idlReport.externalDependencies = idlReport.externalDependencies
            .filter(n => !idlReport.idlNames[n]);
        resolve(idlReport);
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
 * @param {Object} idlReport The IDL report to fill out, see structure
 *   definition in parse function
 * @param {String} contextName The current interface context, used to compute
 *   dependencies at the interface level
 * @return A function that can be applied to all nodes of an IDL AST tree and
 *   that fills up the above sets.
 */
function parseIdlAstTree(idlReport, contextName) {
    const { idlNames, idlExtendedNames, dependencies, externalDependencies } = idlReport;

    return function (def) {
        switch(def.type) {
        case "namespace":
        case "interface":
        case "interface mixin":
        case "dictionary":
        case "callback interface":
            parseInterfaceOrDictionary(def, idlReport);
            break;
        case "enum":
            idlNames[def.name] = serialize(def);
            break;
        case "operation":
            if (def.stringifier || (def.special && def.special === 'stringifier')) return;
            parseType(def.idlType, idlReport, contextName);
            def.arguments.forEach(a => parseType(a.idlType, idlReport, contextName));
            break;
        case "attribute":
        case "field":
            parseType(def.idlType, idlReport, contextName);
            break;
        case 'constructor':
            def.arguments.forEach(a => parseType(a.idlType, idlReport, contextName));
            break;
        case "includes":
        case "implements":
            parseType(def.target, idlReport);
            parseType(def[def.type], idlReport);
            if (!dependencies[def.target]) {
                dependencies[def.target] = [];
            }
            addDependency(def[def.type], {}, dependencies[def.target]);
            if (!idlExtendedNames[def.target]) {
               idlExtendedNames[def.target] = [];
            }
            const mixin = {name: def.target, type: "interface", includes: def.includes};
            idlExtendedNames[def.target].push(serialize(def));
            break;
        case "typedef":
            parseType(def.idlType, idlReport);
            idlNames[def.name] = serialize(def);
            break;
        case "callback":
            idlNames[def.name] = serialize(def);
            def.arguments.forEach(a => parseType(a.idlType, idlReport));
            break;
        case "iterable":
        case "setlike":
        case "maplike":
            var type = def.idlType;
            if (!Array.isArray(type)) {
                type = [def.idlType];
            }
            type.forEach(a => parseType(a, idlReport, contextName));
            break;
        case "serializer":
        case "stringifier":
        case "const":
        case "eof":
            break;
        default:
            throw new Error("Unhandled IDL type: " + def.type + " in " +JSON.stringify(def));
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
function parseInterfaceOrDictionary(def, idlReport) {
    const { idlNames, idlExtendedNames, globals, exposed, jsNames, dependencies, externalDependencies } = idlReport;

    if (!dependencies[def.name]) {
        dependencies[def.name] = [];
    }
    if (def.partial) {
        if (!idlExtendedNames[def.name]) {
            idlExtendedNames[def.name] = [];
        }
        idlExtendedNames[def.name].push(serialize(def));
        addDependency(def.name, idlNames, externalDependencies);
    }
    else {
        idlNames[def.name] = serialize(def);
    }
    if (def.inheritance) {
        addDependency(def.inheritance, idlNames, externalDependencies);
        addDependency(def.inheritance, {}, dependencies[def.name]);
    }

    const globalEA = def.extAttrs.find(ea => ea.name === "Global");
    if (globalEA && globalEA.rhs) {
        const globalNames = (globalEA.rhs.type === "identifier") ?
            [globalEA.rhs.value] : globalEA.rhs.value.map(c => c.value);
        globalNames.forEach(name => {
            if (!globals[name]) {
                globals[name] = [];
            }
            globals[name].push(def.name);
        });
    }

    const exposedEA = def.extAttrs.find(ea => ea.name === "Exposed");
    if (exposedEA && exposedEA.rhs) {
        let exposedNames = [];
        if (exposedEA.rhs.type === "*") {
            exposedNames.push("*");
        } else if (exposedEA.rhs.type === "identifier") {
            exposedNames.push(exposedEA.rhs.value);
        } else {
          exposedNames = exposedEA.rhs.value.map(c => c.value);
        }
        exposedNames.forEach(name => {
            if (!exposed[name]) {
                exposed[name] = [];
            }
            exposed[name].push(def.name);
        });
    }
    if (def.extAttrs.some(ea => ea.name === "Constructor")) {
        addToJSContext(def.extAttrs, jsNames, def.name, "constructors");
        def.extAttrs.filter(ea => ea.name === "Constructor").forEach(function(constructor) {
            if (constructor.arguments) {
                constructor.arguments.forEach(a => parseType(a.idlType, idlReport, def.name));
            }
        });
    } else if (def.extAttrs.some(ea => ea.name === "NamedConstructor")) {
        def.extAttrs.filter(ea => ea.name === "NamedConstructor").forEach(function(constructor) {
            idlNames[constructor.rhs.value] = constructor;
            addToJSContext(def.extAttrs, jsNames, def.name, "constructors");
            if (constructor.arguments) {
                constructor.arguments.forEach(a => parseType(a.idlType, idlReport, def.name));
            }
        });
    } else if (def.members.find(member => member.type === 'constructor')) {
        addToJSContext(def.extAttrs, jsNames, def.name, "constructors");
    } else if (def.type === "interface") {
        addToJSContext(def.extAttrs, jsNames, def.name, "functions");
    }
    def.members.forEach(parseIdlAstTree(idlReport, def.name));
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
    var contexts = [];
    var exposed = eas && eas.some(ea => ea.name === "Exposed");
    if (exposed) {
        var exposedEa = eas.find(ea => ea.name === "Exposed");
        if (exposedEa.rhs.type === "*") {
            contexts = ["*"];
        } else if (exposedEa.rhs.type === "identifier") {
            contexts = [exposedEa.rhs.value];
        } else {
            contexts = exposedEa.rhs.value.map(c => c.value);
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
function parseType(idltype, idlReport, contextName) {
    // For some reasons, webidl2 sometimes returns the name of the IDL type
    // instead of an IDL construct for array constructs. For example:
    //  Constructor(DOMString[] urls) interface toto;
    // ... will create an array IDL node that directly point to "DOMString" and
    // not to a node that describes the "DOMString" type.
    if (isString(idltype)) {
        idltype = { idlType: 'DOMString' };
    }
    if (idltype.union || (idltype.generic && Array.isArray(idltype.idlType))) {
        idltype.idlType.forEach(t => parseType(t, idlReport, contextName));
        return;
    }
    if (idltype.sequence || idltype.array || idltype.generic) {
        parseType(idltype.idlType, idlReport, contextName);
        return;
    }
    var wellKnownTypes = [
            "undefined", "any",
            "boolean",
            "byte", "octet",
            "short", "unsigned short",
            "long", "unsigned long", "long long", "unsigned long long",
            "float", "unrestricted float", "double", "unrestricted double",
            "DOMString", "ByteString", "USVString",
            "object"
    ];
    if (wellKnownTypes.indexOf(idltype.idlType) === -1) {
        addDependency(idltype.idlType, idlReport.idlNames, idlReport.externalDependencies);
        if (contextName) {
            addDependency(idltype.idlType, {}, idlReport.dependencies[contextName]);
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


/**************************************************
Export the parse method for use as module
**************************************************/
module.exports.parse = parse;
module.exports.hasObsoleteIdl = hasObsoleteIdl;


/**************************************************
Code run if the code is run as a stand-alone module
**************************************************/
if (require.main === module) {
    const fs = require("fs");
    const idlFile = process.argv[2];
    if (!idlFile) {
        console.error("No IDL file to parse");
        process.exit(2);
    }

    const idl = fs.readFileSync(idlFile, "utf8");
    parse(idl)
        .then(function (data) {
            console.log(JSON.stringify(data, null, 2));
        })
        .catch(function (err) {
            console.error(err, err.stack);
            process.exit(64);
        });
}
