const { expect } = require('chai');

describe('For Global/Exposed attributes, the WebIDL parser', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('does not expose an interface on Window by default', async () => {
    const data = await parse(`
      interface notExposedOnWindow {};
    `);
    expect(data).to.have.property('jsNames');
    expect(data.jsNames).to.have.property('functions');
    expect(data.jsNames.functions).not.to.have.property('Window');
    expect(data).to.have.property('globals');
    expect(data.globals).to.deep.equal({});
    expect(data).to.have.property('exposed');
    expect(data.exposed).to.deep.equal({});
  });

  it('detects a simple global definition and reference to it', async () => {
    const data = await parse(`
      [Global=primaryInterface]
      interface primaryInterface {};

      [Exposed=primaryInterface]
      interface exposedOnPrimaryInterface {};
    `);
    expect(data).to.have.property('globals');
    expect(data.globals).to.have.property('primaryInterface');
    expect(data.globals.primaryInterface).to.contain('primaryInterface');
    expect(data).to.have.property('exposed');
    expect(data.exposed).to.have.property('primaryInterface');
    expect(data.exposed.primaryInterface).to.contain('exposedOnPrimaryInterface');
    expect(data).to.have.property('jsNames');
    expect(data.jsNames).to.have.property('functions');
    expect(data.jsNames.functions).to.have.property('primaryInterface');
    expect(data.jsNames.functions.primaryInterface).to.contain('exposedOnPrimaryInterface');
  });

  it('uses the right name for a global interface definition', async () => {
    const data = await parse(`
      [Global=theInterface, Exposed=theInterface]
      interface anInterface {};
    `);
    expect(data).to.have.property('globals');
    expect(data.globals).to.have.property('theInterface');
    expect(data.globals).not.to.have.property('anInterface');
    expect(data.globals.theInterface).to.contain('anInterface');
    expect(data).to.have.property('exposed');
    expect(data.exposed).to.have.property('theInterface');
    expect(data.exposed).not.to.have.property('anInterface');
    expect(data.exposed.theInterface).to.contain('anInterface');
    expect(data).to.have.property('jsNames');
    expect(data.jsNames).to.have.property('functions');
    expect(data.jsNames.functions).to.have.property('theInterface');
    expect(data.jsNames.functions.theInterface).to.contain('anInterface');
  });

  it('understands multiple names for a global interface definition', async () => {
    const data = await parse(`
      [Global=(theInterface,sameInterface), Exposed=theInterface]
      interface anInterface {};
    `);
    expect(data).to.have.property('globals');
    expect(data.globals).to.have.property('theInterface');
    expect(data.globals).to.have.property('sameInterface');
    expect(data.globals).not.to.have.property('anInterface');
    expect(data.globals.theInterface).to.contain('anInterface');
    expect(data.globals.sameInterface).to.contain('anInterface');
    expect(data).to.have.property('exposed');
    expect(data.exposed).to.have.property('theInterface');
    expect(data.exposed).not.to.have.property('sameInterface');
    expect(data.exposed).not.to.have.property('anInterface');
    expect(data.exposed.theInterface).to.contain('anInterface');
    expect(data).to.have.property('jsNames');
    expect(data.jsNames).to.have.property('functions');
    expect(data.jsNames.functions).to.have.property('theInterface');
    expect(data.jsNames.functions).not.to.have.property('sameInterface');
    expect(data.jsNames.functions.theInterface).to.contain('anInterface');
  });
});