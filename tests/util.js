const { assert } = require('chai');

const specs = require('web-specs');
const {
  getGeneratedIDLNamesByCSSProperty,
  isLatestLevelThatPasses
} = require('../src/lib/util');

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
    const spec = specs.find(spec => !spec.seriesVersion);
    assert.isTrue(isLatestLevelThatPasses(spec, specs, _ => true));
  });

  it('returns true if spec without level and no predicate', () => {
    const spec = specs.find(spec => !spec.seriesVersion);
    assert.isTrue(isLatestLevelThatPasses(spec, specs));
  });

  it('returns false if spec does not pass the predicate', () => {
    const spec = specs.find(spec => !spec.seriesVersion);
    assert.isFalse(isLatestLevelThatPasses(spec, specs, _ => false));
  });

  it('returns true if spec is the latest level', () => {
    const spec = specs.find(spec => spec.seriesPrevious && !spec.seriesNext &&
      (spec.seriesComposition === 'full'));
    assert.isTrue(isLatestLevelThatPasses(spec, specs));
  });

  it('returns false if spec is not the latest level', () => {
    const spec = specs.find(spec => spec.seriesNext &&
      specs.find(s => (s.shortname === spec.seriesNext) &&
        (s.seriesComposition === 'full')));
    assert.isFalse(isLatestLevelThatPasses(spec, specs));
  });

  it('returns true if greater level has another shortname', () => {
    const spec = specs.find(spec => (spec.seriesVersion === '1') &&
      (spec.seriesComposition === 'full'));
    assert.isTrue(isLatestLevelThatPasses(spec, specs));
  });

  it('returns true if delta spec is alone', () => {
    const spec = specs.find(spec => (spec.seriesComposition === 'delta'));
    const list = spec.seriesPrevious ?
      specs.filter(s => s.shortname !== spec.seriesPrevious) :
      specs;
    assert.isTrue(isLatestLevelThatPasses(spec, list));
  });

  it('returns true if greater level is a delta spec', () => {
    const delta = specs.find(spec => (spec.seriesComposition === 'delta') &&
      spec.seriesPrevious);
    const spec = specs.find(spec => spec.shortname === delta.seriesPrevious);
    assert.isTrue(isLatestLevelThatPasses(spec, specs));
  });

  it('returns true if greater level does not pass predicate', () => {
    const spec = specs.find(spec => spec.seriesNext &&
      specs.find(s => (s.shortname === spec.seriesNext) &&
        (s.seriesComposition === 'full')));
    assert.isTrue(isLatestLevelThatPasses(spec, specs, s => s === spec));
  });
});


describe('getGeneratedIDLNamesByCSSProperty', () => {
  it('returns the camel-cased and dashed attribute names for "touch-action"', () => {
    assert.deepEqual(
      getGeneratedIDLNamesByCSSProperty('touch-action'),
      ['touch-action', 'touchAction']);
  });

  it('returns the camel-cased, webkit-cased and dashed attribute names for "-webkit-background-clip"', () => {
    assert.deepEqual(
      getGeneratedIDLNamesByCSSProperty('-webkit-background-clip'),
      ['-webkit-background-clip', 'WebkitBackgroundClip', 'webkitBackgroundClip']);
  });

  it('returns just the name for "display"', () => {
    assert.deepEqual(
      getGeneratedIDLNamesByCSSProperty('display'),
      ['display']);
  });
});
