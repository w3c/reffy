const { assert } = require('chai');

const { getShortname } = require('../src/lib/util');

describe('getShortname', () => {
  it('/TR/ URLs not handled', () => {
    assert.equal(getShortname({ url: 'https://www.w3.org/TR/webrtc/' }), 'httpswwww3orgwebrtc');
  });

  it('version stripping', () => {
    assert.equal(getShortname({ shortname: 'css-cake-1' }), 'css-cake');
    assert.equal(getShortname({ shortname: 'css-volume-11' }), 'css-volume');
    assert.equal(getShortname({ shortname: 'css3-bananas' }), 'css-bananas');
    assert.equal(getShortname({ shortname: 'xslt5' }), 'xslt');
    // hardcoded exception:
    assert.equal(getShortname({ shortname: 'css3-background' }), 'css-backgrounds');
  });

  it('whatwg.org', () => {
    assert.equal(getShortname({ url: 'https://html.spec.whatwg.org/' }), 'html');
    // multipage HTML spec is not handled correctly:
    assert.equal(getShortname({ url: 'https://html.spec.whatwg.org/multipage/' }), 'httpshtmlspecwhatwgorgmultipage');
    assert.equal(getShortname({ url: 'https://xhr.spec.whatwg.org/' }), 'xhr');
    // idea.whatwg.org not handled:
    assert.equal(getShortname({ url: 'https://great.idea.whatwg.org/' }), 'httpsgreatideawhatwgorg');
  });

  it('khronos.org', () => {
    assert.equal(getShortname({ url: 'https://www.khronos.org/registry/webgl/specs/latest/1.0/' }), 'webgl1');
    assert.equal(getShortname({ url: 'https://www.khronos.org/registry/webgl/specs/latest/2.0/' }), 'webgl2');
  });

  it('github.io', () => {
    assert.equal(getShortname({ url: 'https://heycam.github.io/webidl/' }), 'webidl');
    assert.equal(getShortname({ url: 'https://user.github.io/repo/' }), 'repo');
    assert.equal(getShortname({ url: 'https://w3c.github.io/cool-spec/' }), 'cool-spec');
    assert.equal(getShortname({ url: 'https://w3c.github.io/cool/spec/' }), 'cool');
    assert.equal(getShortname({ url: 'https://w3c.github.io/webappsec-is-cool/' }), 'is-cool');
    assert.equal(getShortname({ url: 'https://wicg.github.io/CamelCase/' }), 'CamelCase');
    assert.equal(getShortname({ url: 'https://wicg.github.io/hyphen-ate-my-camel/' }), 'hyphen-ate-my-camel');
    assert.equal(getShortname({ url: 'https://whatwg.github.io/loader/' }), 'loader');
    // harcoded exception:
    assert.equal(getShortname({ url: 'https://w3c.github.io/ServiceWorker/' }), 'service-workers');
    // no version stripping:
    assert.equal(getShortname({ url: 'https://w3c.github.io/cool-spec-2/' }), 'cool-spec-2');
  });

  it('github.io extensions.html', () => {
    assert.equal(getShortname({ url: 'https://w3c.github.io/cool/extension.html' }), 'cool-extension');
    // plural "extensions" not handled:
    assert.equal(getShortname({ url: 'https://w3c.github.io/cool/extensions.html' }), 'cool');
  });

  it('drafts.*.org', () => {
    assert.equal(getShortname({ url: 'https://drafts.csswg.org/scroll-animations/' }), 'scroll-animations');
    assert.equal(getShortname({ url: 'https://drafts.csswg.org/scroll-animations-1/' }), 'scroll-animations');
    assert.equal(getShortname({ url: 'https://drafts.fxtf.org/compositing/' }), 'compositing');
    assert.equal(getShortname({ url: 'https://drafts.fxtf.org/compositing-2/' }), 'compositing');
    assert.equal(getShortname({ url: 'https://drafts.css-houdini.org/worklets/' }), 'worklets');
    assert.equal(getShortname({ url: 'https://drafts.css-houdini.org/worklets-3/' }), 'worklets');
  });

  it('shortname takes precedence over url', () => {
    assert.equal(getShortname({
      shortname: 'webrtc',
      url: 'https://w3c.github.io/webrtc-pc/'
    }), 'webrtc');
  });
});
