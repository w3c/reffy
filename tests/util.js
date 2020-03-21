const { assert } = require('chai');

const { getShortname, isLatestLevelThatPasses } = require('../src/lib/util');

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
    assert.equal(getShortname({ url: 'https://html.spec.whatwg.org/multipage/' }), 'html');
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

  it('github.io extension specs', () => {
    assert.equal(getShortname({ url: 'https://w3c.github.io/cool/extension.html' }), 'cool-extension');
    assert.equal(getShortname({ url: 'https://w3c.github.io/cool/extensions.html' }), 'cool-extensions');
  });

  it('drafts.*.org', () => {
    assert.equal(getShortname({ url: 'https://drafts.csswg.org/scroll-animations/' }), 'scroll-animations');
    assert.equal(getShortname({ url: 'https://drafts.csswg.org/scroll-animations-1/' }), 'scroll-animations');
    assert.equal(getShortname({ url: 'https://drafts.fxtf.org/compositing/' }), 'compositing');
    assert.equal(getShortname({ url: 'https://drafts.fxtf.org/compositing-2/' }), 'compositing');
    assert.equal(getShortname({ url: 'https://drafts.css-houdini.org/worklets/' }), 'worklets');
    assert.equal(getShortname({ url: 'https://drafts.css-houdini.org/worklets-3/' }), 'worklets');
  });

  it('svgwg.org', () => {
    assert.equal(getShortname({ url: 'https://svgwg.org/svg2-draft/' }), 'SVG');
    assert.equal(getShortname({ url: 'https://svgwg.org/svg2-draft/single-page.html' }), 'SVG');
    assert.equal(getShortname({ url: 'https://svgwg.org/specs/animations/' }), 'svg-animations');
    assert.equal(getShortname({ url: 'https://svgwg.org/specs/strokes/' }), 'svg-strokes');
  });

  it('shortname takes precedence over url', () => {
    assert.equal(getShortname({
      shortname: 'webrtc',
      url: 'https://w3c.github.io/webrtc-pc/'
    }), 'webrtc');
  });

  it('keeps level when requested', () => {
    assert.equal(getShortname({ shortname: 'css-cake-1' }, { keepLevel: true }), 'css-cake-1');
    assert.equal(getShortname({ shortname: 'xslt5' }, { keepLevel: true }), 'xslt5');
    assert.equal(getShortname({ url: 'https://drafts.csswg.org/scroll-animations-1/' }, { keepLevel: true }), 'scroll-animations-1');
    assert.equal(getShortname({ url: 'https://drafts.fxtf.org/compositing-2/' }, { keepLevel: true }), 'compositing-2');
    assert.equal(getShortname({ url: 'https://drafts.css-houdini.org/worklets-3/' }, { keepLevel: true }), 'worklets-3');
  });
});


describe('isLatestLevelThatPasses', () => {
  function getSpecAtLevel(level, flags) {
    flags = flags || {};
    return {
      shortname: 'spec' + (level ? '-' + level : ''),
      url: 'https://www.w3.org/TR/spec' + (level ? '-' + level : '') + '/',
      flags
    };
  }
  function getOtherSpecAtLevel(level, flags) {
    flags = flags || {};
    return {
      shortname: 'other' + (level ? '-' + level : ''),
      url: 'https://www.w3.org/TR/other' + (level ? '-' + level : '') + '/',
      flags
    };
  }

  it('returns true if spec without level passes the predicate', () => {
    const spec = getSpecAtLevel(0);
    const list = [spec];
    assert.isTrue(isLatestLevelThatPasses(spec, list, _ => true));
  });

  it('returns true if spec without level and no predicate', () => {
    const spec = getSpecAtLevel(0);
    const list = [spec];
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns false if spec does not pass the predicate', () => {
    const spec = getSpecAtLevel(0);
    const list = [spec];
    assert.isFalse(isLatestLevelThatPasses(spec, list, _ => false));
  });

  it('returns true if spec is the latest level', () => {
    const spec = getSpecAtLevel(2);
    const list = [spec, getSpecAtLevel(1)];
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns false if spec is not the latest level', () => {
    const spec = getSpecAtLevel(1);
    const list = [spec, getSpecAtLevel(2)];
    assert.isFalse(isLatestLevelThatPasses(spec, list));
  });

  it('returns true if greater level has another shortname', () => {
    const spec = getSpecAtLevel(1);
    const list = [spec, getOtherSpecAtLevel(2)];
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns true if delta spec is alone', () => {
    const spec = getSpecAtLevel(0, { delta: true });
    const list = [spec];
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns true if delta spec is the only one with that name', () => {
    const spec = getSpecAtLevel(0, { delta: true });
    const list = [spec, getOtherSpecAtLevel(1)];
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns true if greater level is a delta spec', () => {
    const spec = getSpecAtLevel(1);
    const list = [spec, getSpecAtLevel(2, { delta: true })];
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns false if delta spec and full spec at the same level exists', () => {
    const spec = getSpecAtLevel(1, { delta: true });
    const list = [spec, getSpecAtLevel(1)];
    assert.isFalse(isLatestLevelThatPasses(spec, list));
  });

  it('returns true if greater level does not pass predicate', () => {
    const spec = getSpecAtLevel(1);
    const list = [spec, getSpecAtLevel(2)];
    assert.isTrue(isLatestLevelThatPasses(spec, list, s => s === spec));
  });

  it('returns true if first spec at that level', () => {
    const spec = getSpecAtLevel(1);
    const list = [spec, getSpecAtLevel(1)];
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns false if not the first spec at that level', () => {
    const spec = getSpecAtLevel(1);
    const list = [getSpecAtLevel(1), spec];
    assert.isFalse(isLatestLevelThatPasses(spec, list));
  });
});