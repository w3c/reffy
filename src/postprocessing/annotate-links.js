/**
 * Post-processing module that annotates links extracts with the spec
   shortname they link to
 */
const fs = require('fs');
const path = require('path');

function canonicalizeUrl(url) {
    return url.replace(/^http:/, 'https:')
            .split('#')[0]
            .replace('index.html', '')
            .replace('Overview.html', '')
            .replace('cover.html', '')
            .replace(/spec.whatwg.org\/.*/, 'spec.whatwg.org/')  // subpage to main document in whatwg
            .replace(/w3.org\/TR\/(([^\/]+\/)+)[^\/]+\.[^\/]+$/, 'w3.org/TR/$1') // subpage to main document in w3c
            .replace(/w3.org\/TR\/([^\/]+)$/, 'w3.org/TR/$1/') // enforce trailing slash
            .replace(/w3c.github.io\/([^\/]+)$/, 'w3c.github.io/$1/') // enforce trailing slash for ED on GitHub
        ;
}

const needsSaving = {};

module.exports = {
  dependsOn: ['links'],
  input: 'spec',
  property: 'links',

  run: function(spec, {speclist}) {
    if (!speclist || !speclist.length) {
      console.error("No spec list passed as input, cannot annotate links in post-processing");
      return spec;
    }
    for (let link of Object.keys(spec.links || {})) {
      // Annotate with the spec to which the page belong if we can find one
      const specUrl = canonicalizeUrl(link);
      let matchingSpec = speclist.find(s => s?.release?.url === specUrl || s?.nightly?.url === specUrl || (s?.series?.currentSpecification === s?.shortname && (s?.series?.nightlyUrl === specUrl || s?.series?.releaseUrl === specUrl)) || s?.nightly?.pages?.includes(specUrl) || s?.release?.pages?.includes(specUrl));
      if (matchingSpec) {
        spec.links[link].specShortname = matchingSpec.shortname;
      }
    }
    return spec;
  }
};
