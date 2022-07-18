/**
 * Post-processing module that creates a parsed IDL structure out of the IDL
 * extract.
 * 
 * The module runs at the spec level and generates an `idlparsed` property.
 */

const webidlParser = require('../cli/parse-webidl');

module.exports = {
  dependsOn: ['idl'],
  input: 'spec',
  property: 'idlparsed',

  run: async function(spec, options) {
    if (!spec?.idl) {
      return spec;
    }
    try {
      spec.idlparsed = await webidlParser.parse(spec.idl);
      spec.idlparsed.hasObsoleteIdl = webidlParser.hasObsoleteIdl(spec.idl);
    }
    catch (err) {
      // IDL content is invalid and cannot be parsed.
      // Let's return the error, along with the raw IDL
      // content so that it may be saved to a file.
      spec.idlparsed = err.toString();
    }
    return spec;
  }
};
