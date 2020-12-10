import getTitle from './get-title.mjs';
import getGenerator from './get-generator.mjs';
import getLastModifiedDate from './get-lastmodified-date.mjs';
import extractWebIdl from './extract-webidl.mjs';
import extractCSS from './extract-cssdfn.mjs';
import extractDefinitions from './extract-dfns.mjs';
import extractHeadings from './extract-headings.mjs';
import extractIds from './extract-ids.mjs';
import extractReferences from './extract-references.mjs';
import extractLinks from './extract-links.mjs';
import mapIdsToHeadings from './map-ids-to-headings.mjs';
import { canonicalizeUrl, canonicalizesTo } from './canonicalize-url.mjs';


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
