import getTitle from './get-title.js';
import getGenerator from './get-generator.js';
import getLastModifiedDate from './get-lastmodified-date.js';
import extractWebIdl from './extract-webidl.js';
import extractCSS from './extract-cssdfn.js';
import extractDefinitions from './extract-dfns.js';
import extractHeadings from './extract-headings.js';
import extractIds from './extract-ids.js';
import extractReferences from './extract-references.js';
import extractLinks from './extract-links.js';
import mapIdsToHeadings from './map-ids-to-headings.js';
import { canonicalizeUrl, canonicalizesTo } from './canonicalize-url.js';


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
    extractHeadings,
    extractIds,
    extractReferences,
    extractLinks,
    canonicalizeUrl,
    canonicalizesTo,
    mapIdsToHeadings
  }
);
