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
  input: 'crawl',
  property: 'links',

  run: function(crawl, options) {
    crawl.results.forEach(s => {
      for (let link of Object.keys(s.links || {})) {
	// Annotate with the spec to which the page belong if we can find one
	const specUrl = canonicalizeUrl(link);
	let matchingSpec = crawl.results.find(s => s?.release?.url === specUrl || s?.nightly?.url === specUrl || (s?.series?.currentSpecification === s?.shortname && (s?.series?.nightlyUrl === specUrl || s?.series?.releaseUrl === specUrl)) || s?.nightly?.pages?.includes(specUrl) || s?.release?.pages?.includes(specUrl));
	if (matchingSpec) {
	  needsSaving[s.shortname] = true;
	  s.links[link].specShortname = matchingSpec.shortname;
	}
      }
    });
    return crawl;
  },

  save: async function({results}, options) {
    return Promise.all(Object.values(results).map(async spec => {
      const contents = {
        spec: {
          title: spec.title,
          url: spec.crawled
        },
	links: spec.links
      };
      const json = JSON.stringify(contents, null, 2);
      const folder = path.join(options.output, "links");
      const filename = path.join(folder, `${spec.shortname}.json`);
      return await fs.promises.writeFile(filename, json);
    }));
  }
};
