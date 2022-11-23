/**
 * Post-processing module that adds CSS property definitions found in prose
 * from the dfns extract, clean up property definitions that should never have
 * been extracted, and adds the generated IDL attribute names in a
 * styleDeclaration sub-property.
 *
 * Module runs at the spec level. It does not create a distinct property but
 * rather completes the `css` property with additional info.
 */

const { getGeneratedIDLNamesByCSSProperty } = require('../lib/util');

module.exports = {
  dependsOn: ['css', 'dfns'],
  input: 'spec',

  run: async function(spec, options) {
    if (spec.dfns && spec.css) {
      spec.dfns
        .filter(dfn => dfn.type == "property" && !dfn.informative)
        .forEach(propDfn => {
          propDfn.linkingText.forEach(lt => {
            if (!spec.css.properties.find(p => p.name === lt)) {
              spec.css.properties.push({
                name: lt
              });
            }
          });
        });
    }

    if (spec.css) {
      // Add generated IDL attribute names
      spec.css.properties.forEach(dfn => {
        dfn.styleDeclaration = getGeneratedIDLNamesByCSSProperty(dfn.name);
      });

      // Drop the sample definition (property-name) in CSS2 and the custom
      // property definition (--*) in CSS Variables that specs incorrectly flag
      // as real CSS properties.
      spec.css.properties = spec.css.properties.filter(p =>
        !['property-name', '--*'].includes(p.name));
    }

    return spec;
  }
};
