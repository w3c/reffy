const assert = require('assert');

describe('The WebIDL parser understands includes statements', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('does not choke on includes statements', async () => {
    const data = await parse(`
interface Base {};
interface Extended {};
Extended includes Base;
    `);
    assert(data?.idlNames?.Extended, 'idlNames.Extended is not set');
  });
});