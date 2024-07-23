/**
 * Post-processing module that can be used to patch definition extracts,
 * typically to drop problematic duplicate definitions they may contain.
 * 
 * This post-processing module should only be considered as last resort because
 * it requires manual maintenance over time. Goal is to hardcode things here
 * only when duplicate terms create actual referencing issues, not to resolve
 * all duplicate definitions conflicts.
 *
 * The module runs at the spec level.
 */

export default {
  dependsOn: ['dfns'],
  input: 'spec',

  run: async function (spec, options) {
    // Note the spec object passed to post-processing modules does not contain
    // any specific detail on the spec other than the crawled URL, so no direct
    // way to match spec on its shortname
    if (spec.crawled && spec.dfns) {
      // https://github.com/w3c/webref/blob/main/ed/idlpatches/orientation-event.idl.patch
      if (spec.crawled.includes('/deviceorientation/') ||
          spec.crawled.includes('/TR/orientation-event/')) {
        spec.dfns = spec.dfns.filter(dfn =>
          !dfn.linkingText.includes('PermissionState') &&
          !dfn.for.includes('PermissionState'));
      }

      // https://github.com/w3c/webref/blob/main/ed/idlpatches/portals.idl.patch
      else if (spec.crawled.includes('/portals/')) {
        spec.dfns = spec.dfns.filter(dfn =>
          dfn.linkingText[0] !== 'MessageEventSource');
      }

      // The /TR versions of WebCrypto API, Publication Manifest and Audiobooks
      // do not follow the usual dfn data model. Definitions get extracted as
      // "exported" as a result. This creates collisions. The nightly versions
      // of the specs respect the dfn data model and these specs don't export
      // terms in practice. Also see discussion in:
      // https://github.com/w3c/reffy/issues/1250
      else if (spec.crawled.includes('/TR/WebCryptoAPI/') ||
          spec.crawled.includes('/TR/pub-manifest/') ||
          spec.crawled.includes('/TR/audiobooks/')) {
        spec.dfns.forEach(dfn => dfn.access = 'private');
      }
    }

    return spec;
  }
};
