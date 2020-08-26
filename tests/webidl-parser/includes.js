const { expect } = require('chai');

describe('The WebIDL parser understands includes statements', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('does not choke on includes statements', async () => {
    const data = await parse(`
interface Base {};
interface Extended {};
Extended includes Base;
    `);
    expect(data).to.have.property('idlNames');
    expect(data.idlNames).to.have.property('Extended');
  });
});