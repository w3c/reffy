/**
 * Post-processing module that creates a parsed IDL structure out of the IDL
 * extract.
 * 
 * The module runs at the spec level and generates an `idlparsed` property.
 */

const webidlParser = require('../cli/parse-webidl');

module.exports = {
  dependsOn: ['dfns', 'idl'],
  input: 'spec',
  property: 'idlparsed',

  run: async function(spec, options) {
    function getHref(idl, member) {
      let dfnType;
      let dfnFor;
      let dfnOverload = 0;
      let dfnName;
      if (member) {
        if (['iterable', 'maplike', 'setlike'].includes(member.type) ||
            ['getter', 'setter', 'stringifier', 'deleter'].includes(member.special)) {
          // No dfns of these types in any spec as of Feb 2024, or at least no
          // no dfns that we can easily map to (for example, the HTML spec
          // tends to use generic "dfn" for these).
          return null;
        }
        if (member.type === 'operation') {
          dfnType = 'method';
          dfnOverload = idl.members
            .filter(m => m.type === member.type && m.name === member.name)
            .findIndex(m => m === member);
        }
        else if (member.type === 'field') {
          dfnType = 'dict-member';
        }
        else {
          dfnType = member.type;
        }
        if (!['constructor', 'method', 'attribute', 'enum-value', 'dict-member', 'const'].includes(dfnType)) {
          console.error(`[error] Found unexpected IDL member type "${dfnType}" in ${spec.shortname}`);
        }
        dfnName = member.name ?? member.value;
        dfnFor = idl.name;
      }
      else {
        // The type of the dfn to look for is the same as the IDL type, except
        // that composed IDL types ("interface mixin", "callback interface")
        // only have the basic type in definitions.
        dfnType = idl.type.split(' ')[0];
        dfnName = idl.name;
      }

      const dfnNames = [];
      if (dfnType === 'enum-value') {
        // Bikeshed keeps wrapping quotes in the dfn linking text, not ReSpec.
        dfnNames.push(dfnName);
        dfnNames.push(`"${dfnName}"`);
      }
      else if (dfnType === 'method') {
        // Bikeshed adds "..." for variadic arguments, not ReSpec. Let's try
        // both variants. For overloads, Bikeshed essentially expects arguments
        // to have different names, while ReSpec adds "!overload-x" to
        // overloaded methods. We'll test all possibilities in order. If the
        // spec only has a dfn for the most basic method, it's possible that we
        // end up linking to that dfn from the overloaded methods too, but that
        // seems good enough in practice.
        // Last, method definitions sometimes appear without arguments (notably
        // in the HTML spec).
        const argsVariadic = member.arguments.map(arg => (arg.variadic ? '...' : '') + arg.name);
        const args = member.arguments.map(arg => arg.name);
        dfnNames.push(`${dfnName}!overload-${dfnOverload}(${args.join(', ')})`);
        dfnNames.push(`${dfnName}(${argsVariadic.join(', ')})`);
        dfnNames.push(`${dfnName}(${args.join(', ')})`);
        dfnNames.push(`${dfnName}()`);
      }
      else if (dfnType === 'constructor') {
        // Same as for methods
        const argsVariadic = member.arguments.map(arg => (arg.variadic ? '...' : '') + arg.name);
        const args = member.arguments.map(arg => arg.name);
        dfnNames.push(`constructor!overload-${dfnOverload}(${args.join(', ')})`);
        dfnNames.push(`constructor(${argsVariadic.join(', ')})`);
        dfnNames.push(`constructor(${args.join(', ')})`);
        dfnNames.push(`constructor()`);
      }
      else {
        dfnNames.push(dfnName);
      }

      // Look for definitions that look like good initial candidates
      const candidateDfns = spec.dfns
        .filter(dfn => dfn.type === dfnType && !dfn.informative &&
          (dfnFor ? dfn.for.includes(dfnFor) : true));

      // Look for names in turn in that list of candidates.
      for (const name of dfnNames) {
        const dfns = candidateDfns.filter(dfn => dfn.linkingText.includes(name));
        if (dfns.length > 0) {
          if (dfns.length > 1) {
            const forLabel = dfnFor ? ` for \`${dfnFor}\`` : '';
            console.warn(`[warn] More than one dfn for ${dfnType} \`${dfnName}\`${forLabel} in [${spec.shortname}](${spec.crawled}).`);
            return null;
          }
          else {
            return dfns[0].href;
          }
        }
      }

      // Report missing dfns except for specs that we know already lack them
      if (!['webgl1', 'webgl2', 'svg-animations', 'SVG2'].includes(spec.shortname)) {
        const forLabel = dfnFor ? ` for \`${dfnFor}\`` : '';
        console.warn(`[warn] No dfn for ${dfnType} \`${dfnName}\`${forLabel} in [${spec.shortname}](${spec.crawled})`);
      }
      return null;
    }

    if (!spec?.idl) {
      return spec;
    }
    try {
      spec.idlparsed = await webidlParser.parse(spec.idl);
      spec.idlparsed.hasObsoleteIdl = webidlParser.hasObsoleteIdl(spec.idl);

      if (spec.dfns) {
        for (const idl of Object.values(spec.idlparsed.idlNames)) {
          const href = getHref(idl);
          if (href) {
            idl.href = href;
          }

          if (idl.values) {
            for (const value of idl.values) {
              const href = getHref(idl, value);
              if (href) {
                value.href = href;
              }
            }
          }

          if (idl.members) {
            for (const member of idl.members) {
              const href = getHref(idl, member);
              if (href) {
                member.href = href;
              }
            }
          }
        }

        for (const extendedIdl of Object.values(spec.idlparsed.idlExtendedNames)) {
          for (const idl of extendedIdl) {
            // No dfn for the extension, we can only link specific members
            if (idl.values) {
              for (const value of idl.values) {
                const href = getHref(idl, value);
                if (href) {
                  value.href = href;
                }
              }
            }

            if (idl.members) {
              for (const member of idl.members) {
                const href = getHref(idl, member);
                if (href) {
                  member.href = href;
                }
              }
            }
          }
        }
      }
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
