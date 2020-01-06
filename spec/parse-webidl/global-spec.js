describe('For Global/Exposed attributes, the WebIDL parser', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('does not expose an interface on Window by default', done => {
    parse(`
        interface notExposedOnWindow {};
        `)
      .then(data => {
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).not.toHaveProperty('Window');
        expect(data.jsNames.functions.Window).not.toContain('notExposedOnWindow');
        expect(data).toHaveProperty('globals');
        expect(data.globals).toEqual({});
        expect(data).toHaveProperty('exposed');
        expect(data.exposed).toEqual({});
      })
      .catch(fail)
      .then(done);
  });

  it('detects a simple global definition and reference to it', done => {
    parse(`
        [Global=primaryInterface]
        interface primaryInterface {};

        [Exposed=primaryInterface]
        interface exposedOnPrimaryInterface {};
        `)
      .then(data => {
        expect(data).toHaveProperty('globals');
        expect(data.globals).toHaveProperty('primaryInterface');
        expect(data.globals.primaryInterface).toContain('primaryInterface');
        expect(data).toHaveProperty('exposed');
        expect(data.exposed).toHaveProperty('primaryInterface');
        expect(data.exposed.primaryInterface).toContain('exposedOnPrimaryInterface');
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
        expect(data).toHaveProperty('exposed');
        expect(data.exposed).toHaveProperty('theInterface');
        expect(data.exposed).not.toHaveProperty('anInterface');
        expect(data.exposed.theInterface).toContain('anInterface');
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
        expect(data).toHaveProperty('exposed');
        expect(data.exposed).toHaveProperty('theInterface');
        expect(data.exposed).not.toHaveProperty('sameInterface');
        expect(data.exposed).not.toHaveProperty('anInterface');
        expect(data.exposed.theInterface).toContain('anInterface');
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