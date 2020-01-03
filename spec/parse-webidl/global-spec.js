describe('The WebIDL parser understands Global/Exposed attributes', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('does not expose interface on Window by default', done => {
    parse(`
        interface notExposedOnWindow {};
        `)
      .then(data => {
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).not.toHaveProperty('Window');
        expect(data.jsNames.functions.Window).not.toContain('notExposedOnWindow');
      })
      .catch(fail)
      .then(done);
  });

  xit('detects a simple global definition and references to it', done => {
    parse(`
        [Global]
        interface primaryInterface {};

        [Exposed=primaryInterface]
        interface exposedOnPrimaryInterface {};
        `)
      .then(data => {
        expect(data).toHaveProperty('globals');
        expect(data.globals).toHaveProperty('primaryInterface');
        expect(data.globals.primaryInterface).toContain('primaryInterface');
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).toHaveProperty('primaryInterface');
        expect(data.jsNames.functions.primaryInterface).toContain('exposedOnPrimaryInterface');
      })
      .catch(fail)
      .then(done);
  });

  it('uses the right name for a global interface definition', done => {
    parse(`
        [Global=theInterface, Exposed=theInterface]
        interface anInterface {};
        `)
      .then(data => {
        expect(data).toHaveProperty('globals');
        expect(data.globals).toHaveProperty('theInterface');
        expect(data.globals).not.toHaveProperty('anInterface');
        expect(data.globals.theInterface).toContain('anInterface');
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).toHaveProperty('theInterface');
        expect(data.jsNames.functions.theInterface).toContain('anInterface');
      })
      .catch(fail)
      .then(done);
  });

  it('understands multiple names for a global interface definition', done => {
    parse(`
        [Global=(theInterface,sameInterface), Exposed=theInterface]
        interface anInterface {};
        `)
      .then(data => {
        expect(data).toHaveProperty('globals');
        expect(data.globals).toHaveProperty('theInterface');
        expect(data.globals).toHaveProperty('sameInterface');
        expect(data.globals).not.toHaveProperty('anInterface');
        expect(data.globals.theInterface).toContain('anInterface');
        expect(data.globals.sameInterface).toContain('anInterface');
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).toHaveProperty('theInterface');
        expect(data.jsNames.functions).not.toHaveProperty('sameInterface');
        expect(data.jsNames.functions.theInterface).toContain('anInterface');
      })
      .catch(fail)
      .then(done);
  });
});