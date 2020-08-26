const { expect } = require('chai');

describe('The WebIDL parser exports all IDL names', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('exports named definitions', async () => {
    const data = await parse(`
      interface testInterface {};
      dictionary testDict {};
      enum testEnum { "one" };
      callback testCallback = void ();
      typedef string testTypedef;
      callback interface testCallbackInterface {};
    `);
    expect(data).to.be.an('object').with.property('idlNames');
    expect(data.idlNames).to.have.property('testInterface');
    expect(data.idlNames).to.have.property('testDict');
    expect(data.idlNames).to.have.property('testEnum');
    expect(data.idlNames).to.have.property('testCallback');
    expect(data.idlNames).to.have.property('testTypedef');
    expect(data.idlNames).to.have.property('testCallbackInterface');
  });

  it('does not export partial named definitions', async () => {
    const data = await parse(`
      partial interface testInterface {};
      partial dictionary testDict {};
    `);
    expect(data).to.be.an('object').with.property('idlNames');
    expect(data.idlNames).not.to.have.property('testInterface');
    expect(data.idlNames).not.to.have.property('testDict');
  });
});