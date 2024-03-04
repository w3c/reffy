const assert = require('assert');

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
    assert.strictEqual(isLatestLevelThatPasses(spec, specs, _ => true), true);
  });

  it('returns true if spec without level and no predicate', () => {
    const spec = specs.find(spec => !spec.seriesVersion);
    assert.strictEqual(isLatestLevelThatPasses(spec, specs), true);
  });

  it('returns false if spec does not pass the predicate', () => {
    const spec = specs.find(spec => !spec.seriesVersion);
    assert.strictEqual(isLatestLevelThatPasses(spec, specs, _ => false), false);
  });

  it('returns true if spec is the latest level', () => {
    const spec = specs.find(spec => spec.seriesPrevious && !spec.seriesNext &&
      (spec.seriesComposition === 'full'));
    assert.strictEqual(isLatestLevelThatPasses(spec, specs), true);
  });

  it('returns false if spec is not the latest level', () => {
    const spec = specs.find(spec => spec.seriesNext &&
      specs.find(s => (s.shortname === spec.seriesNext) &&
        (s.seriesComposition === 'full')));
    assert.strictEqual(isLatestLevelThatPasses(spec, specs), false);
  });

  it('returns true if greater level has another shortname', () => {
    const spec = specs.find(spec => (spec.seriesVersion === '1') &&
      (spec.seriesComposition === 'full'));
    assert.strictEqual(isLatestLevelThatPasses(spec, specs), true);
  });

  it('returns true if delta spec is alone', () => {
    const spec = specs.find(spec => (spec.seriesComposition === 'delta'));
    const list = spec.seriesPrevious ?
      specs.filter(s => s.shortname !== spec.seriesPrevious) :
      specs;
    assert.strictEqual(isLatestLevelThatPasses(spec, list), true);
  });

  it('returns true if greater level is a delta spec', () => {
    const delta = specs.find(spec => (spec.seriesComposition === 'delta') &&
      spec.seriesPrevious);
    const spec = specs.find(spec => spec.shortname === delta.seriesPrevious);
    assert.strictEqual(isLatestLevelThatPasses(spec, specs), true);
  });

  it('returns true if greater level does not pass predicate', () => {
    // Only consider specs that are at or after the current specification
    const isRecentEnough = spec => {
      while (spec) {
        if (spec.series.currentSpecification === spec.shortname) {
          return true;
        }
        spec = specs.find(s => s.shortname === spec.seriesPrevious);
      }
      return false;
    };
    const spec = specs.find(spec => spec.seriesNext &&
      isRecentEnough(spec) &&
      specs.find(s => (s.shortname === spec.seriesNext) &&
        (s.seriesComposition === 'full')));
    assert.strictEqual(isLatestLevelThatPasses(spec, specs, s => s === spec), true);
  });

  it('returns false if spec is too old', () => {
    const spec = specs.find(spec => spec.seriesPrevious &&
      spec.shortname === spec.series.currentSpecification);
    const previous = specs.find(s => s.shortname === spec.seriesPrevious);
    assert.strictEqual(isLatestLevelThatPasses(previous, specs, s => s === previous), false);
  });

  it('returns true for delta spec when full spec is too old', () => {
    // Note this will fail when CSS Cascade drafts progress on the Rec track,
    // but that's the only series that has both an outdated version and a delta
    // spec in the list.
    const old = specs.find(spec => spec.shortname === 'css-cascade-3');
    const delta = specs.find(spec => spec.shortname === 'css-cascade-6');
    assert.strictEqual(isLatestLevelThatPasses(delta, specs, s => s === delta || s === old), true);
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
