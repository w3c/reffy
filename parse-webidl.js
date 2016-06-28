var WebIDL2 = require("webidl2");

function parse(idl, cb) {
    var idlTree;
    var jsNames = {constructors: {}, functions: {}, objects:{}};
    var idlNames = {};
    var idlExtendedNames = {};
    var localNames= {};
    var externalDependencies = [];
    try {
        idlTree = WebIDL2.parse(idl);
    } catch (e) {
        return cb(e);
    }
    idlTree.forEach(parseIdlAstTree(jsNames, idlNames, idlExtendedNames, localNames, externalDependencies));
    externalDependencies = externalDependencies.filter(n => !idlNames[n] && !localNames[n]);
    cb(null, {jsNames, idlNames, idlExtendedNames, localNames, externalDependencies});
}

function parseIdlAstTree(jsNames, idlNames,idlExtendedNames, localNames, externalDependencies) {
    return function (def) {
        switch(def.type) {
        case "interface":
        case "dictionary":
        case "callback interface":
            parseInterfaceOrDictionary(def, jsNames, idlNames, idlExtendedNames, localNames, externalDependencies);
            break;
        case "enum":
            idlNames[def.name] = def;
            break;
        case "operation":
            parseType(def.idlType, idlNames, localNames, externalDependencies);
            def.arguments.forEach(a => parseType(a.idlType,  idlNames, localNames, externalDependencies));
            break;
        case "attribute":
        case "field":
        case "iterable":
            parseType(def.idlType, idlNames, localNames, externalDependencies);
            break;
        case "implements":
            parseType(def.target, idlNames, localNames, externalDependencies);
            parseType(def.implements, idlNames, localNames, externalDependencies);
            break;
        case "typedef":
            parseType(def.idlType, idlNames, localNames, externalDependencies);
            localNames[def.name] = def;
            break;
        case "callback":
            localNames[def.name] = def;
            def.arguments.forEach(a => parseType(a.idlType,  idlNames, localNames, externalDependencies));
            break;
        case "setlike":
        case "maplike":
            console.log(def);
            def.members.forEach(a => parseType(a.idlType, idlNames, localNames, externalDependencies));
            break;
        case "serializer":
        case "stringifier":
        case "const":
            break;
        default:
            console.error("Unhandled IDL type: " + def.type);
        }
    };
}

function parseInterfaceOrDictionary(def, jsNames, idlNames, idlExtendedNames, localNames, externalDependencies) {
    if (def.partial) {
        idlExtendedNames[def.name] = def;
        addDependency(def.name, idlNames, externalDependencies);
    } else {
        if (def.inheritance) {
            addDependency(def.inheritance, idlNames, externalDependencies);
        }
        idlNames[def.name] = def;
        if (def.extAttrs.filter(ea => ea.name === "Constructor").length) {
            addToJSContext(def.extAttrs, jsNames, def.name, "constructors");
        } else if (def.extAttrs.filter(ea => ea.name === "NamedConstructor").length) {
            def.extAttrs.filter(ea => ea.name === "NamedConstructor").forEach(function(ea) {
                idlNames[ea.rhs.value] = ea;
                addToJSContext(def.extAttrs, jsNames, def.name, "constructors");
             })
        } else if (def.type === "interface") {
            if (!def.extAttrs.filter(ea => ea.name === "NoInterfaceObject").length) {
                addToJSContext(def.extAttrs, jsNames, def.name, "functions");
            }
        }
    }
    def.members.forEach(parseIdlAstTree(jsNames, idlNames, idlExtendedNames, localNames, externalDependencies));
}

function addToJSContext(eas, jsNames, name, type) {
    var contexts = ["Window"];
    var exposed = eas && eas.filter(ea => ea.name === "Exposed").length;
    if (exposed) {
        var exposedEa = eas.filter(ea => ea.name === "Exposed")[0];
        if (exposedEa.rhs.type === "identifier") {
            contexts = [exposedEa.rhs.value];
        } else {
            contexts = exposedEa.rhs.value;
        }
    }
    contexts.forEach(c => { if (!jsNames[type][c]) jsNames[type][c] = []; jsNames[type][c].push(name)});
}

function parseType(idltype, idlNames, localNames, externalDependencies) {
    if (idltype.union) {
        idltype.idlType.forEach(t => parseType(t, idlNames, localNames, externalDependencies));
        return;
    }
    if (idltype.sequence || idltype.array || idltype.generic) {
        parseType(idltype.idlType, idlNames, localNames, externalDependencies);
        return;
    }
    var wellKnownTypes = ["void", "any", "boolean", "byte", "octet", "short", "unsigned short", "long", "unsigned long", "long long", "unsigned long long", "float", "unrestricted float", "double", "unrestricted double", "DOMString", "ByteString", "USVString", "object",
                          "RegExp", "Error", "DOMException", "ArrayBuffer", "DataView", "Int8Array", "Int16Array", "Int32Array", "Uint8Array", "Uint16Array", "Uint32Array", "Uint8ClampedArray", "Float32Array", "Float64Array",
                          "ArrayBufferView", "BufferSource", "DOMTimeStamp", "Function", "VoidFunction"];
    if (wellKnownTypes.indexOf(idltype.idlType) === -1) {
        addDependency(idltype.idlType, idlNames, externalDependencies);
    }
}

function addDependency(name, idlNames, externalDependencies) {
    if (Object.keys(idlNames).indexOf(name) === -1 && externalDependencies.indexOf(name) === -1) {
        externalDependencies.push(name);
    }
}

module.exports.parse = parse;

if (require.main === module) {
    var url = process.argv[2];
    if (!url) {
        console.error("Required URL parameter missing");
        process.exit(2);
    }
    var webidlExtract = require("./extract-webidl");
    webidlExtract.extract(url, function(err, idl) {
        if (err) {
            console.error(err);
            process.exit(64);
        }
        parse(idl, function(err, data) {
            if (err) {
                console.error(err);
                process.exit(64);
            }
            console.log(JSON.stringify(data, null, 2));
        });
    });
}

