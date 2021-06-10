/**
 * Query selector that matches informative sections
 * 
 * Based on:
 * https://github.com/w3c/respec/blob/develop/src/core/utils.js#L45
 * https://tabatkins.github.io/bikeshed/#metadata-informative-classes
 */
export default [
  '.informative',
  '.note',
  '.issue',
  '.example',
  '.ednote',
  '.practice',
  '.introductory',
  '.non-normative'
].join(',');