module.exports = url =>
      url.replace(/^http:/, 'https:')
      .split('#')[0]
      .replace('index.html', '')
      .replace('Overview.html', '')
      .replace(/spec.whatwg.org\/.*/, 'spec.whatwg.org/')  // subpage to main document in whatwg
      .replace(/w3.org\/TR\/[0-9]{4}\/[A-Z]+-(.*)-[0-9]{8}\/?/, 'w3.org/TR/$1/') // dated to latest
      .replace(/w3.org\/TR\/([^\/]+)\/.*/, 'w3.org/TR/$1/') // subpage to main document in w3c
      .replace(/w3.org\/TR\/([^\/]+)$/, 'w3.org/TR/$1/') // enforce trailing slash
    ;
