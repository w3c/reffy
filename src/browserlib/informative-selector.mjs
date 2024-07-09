/**
 * Query selector that matches informative sections
 * 
 * Based on:
 * https://github.com/w3c/respec/blob/develop/src/core/utils.js#L45
 * https://tabatkins.github.io/bikeshed/#metadata-informative-classes
 */
export default [
  '.informative',
  '.informative-bg',
  '.note',
  '.issue',
  '.example',
  '.ednote',
  '.annotation',
  '.practice',
  '.introductory',
  '.non-normative',
  'aside',
  '.idlHeader',
  '[id^=dfn-panel-]',
  '.mdn-anno',
  '.wpt-tests-block',
  'details.respec-tests-details'
].join(',');