/**
 * Return a canonicalized version of the given URL.
 *
 * By default, the canonicalized URL should represent the same resource and
 * typically de-reference to the same document (or a subpage of it).
 *
 * Canonicalization can be made a bit stronger through options, in particular
 * to canonicalize dated W3C URLs to the Latest version, and to use a list of
 * equivalent URLs (that the crawler typically generates).
 */
export function canonicalizeUrl(url, options) {
    options = options || {};

    let canon = url.replace(/^http:/, 'https:')
            .split('#')[0]
            .replace('index.html', '')
            .replace('Overview.html', '')
            .replace('cover.html', '')
            .replace(/spec.whatwg.org\/.*/, 'spec.whatwg.org/')  // subpage to main document in whatwg
            .replace(/w3.org\/TR\/(([^\/]+\/)+)[^\/]+\.[^\/]+$/, 'w3.org/TR/$1') // subpage to main document in w3c
            .replace(/w3.org\/TR\/([^\/]+)$/, 'w3.org/TR/$1/') // enforce trailing slash
            .replace(/w3c.github.io\/([^\/]+)$/, 'w3c.github.io/$1/') // enforce trailing slash for ED on GitHub
        ;

    if (options.datedToLatest) {
        canon = canon.replace(
            /w3.org\/TR\/[0-9]{4}\/[A-Z]+-(.*)-[0-9]{8}\/?/,
            'w3.org/TR/$1/');
    }

    let equivalentUrls = (options.equivalents) ? options.equivalents[canon] : null;
    if (Array.isArray(equivalentUrls)) {
        return (options.returnAlternatives ? equivalentUrls : equivalentUrls[0]);
    }
    else {
        return (equivalentUrls ? equivalentUrls : canon);
    }
}


export function canonicalizesTo(url, refUrl, options) {
    let newOptions = {
        datedToLatest: (options ? options.datedToLatest : false),
        equivalents: (options ? options.equivalents : null),
        returnAlternatives: true
    };
    let canon = canonicalizeUrl(url, newOptions);
    return Array.isArray(refUrl) ?
        refUrl.some(u => canon.includes(u)) :
        canon.includes(refUrl);
}