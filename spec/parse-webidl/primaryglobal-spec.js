describe('The WebIDL parser exports all IDL names', () => {
  var parse = require('../../parse-webidl').parse;

  it('exposes interface on Window by default', done => {
    parse(`
        interface exposedOnWindow {};
        `)
      .then(data => {
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).toHaveProperty('Window');
        expect(data.jsNames.functions.Window).toContain('exposedOnWindow');
      })
      .catch(fail)
      .then(done);
  });

  it('detects primary global interface definitions', done => {
    parse(`
        [PrimaryGlobal]
        interface primaryInterface {};

        interface exposedOnPrimaryInterface {};
        `)
      .then(data => {
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).toHaveProperty('primaryInterface');
        expect(data.jsNames.functions.primaryInterface).toContain('primaryInterface');
        expect(data.jsNames.functions.primaryInterface).toContain('exposedOnPrimaryInterface');
      })
      .catch(fail)
      .then(done);
  });

  it('uses the right name for a primary global interface definitions', done => {
    parse(`
        [PrimaryGlobal=theInterface]
        interface primaryInterface {};

        interface exposedOnTheInterface {};
        `)
      .then(data => {
        expect(data).toHaveProperty('jsNames');
        expect(data.jsNames).toHaveProperty('functions');
        expect(data.jsNames.functions).toHaveProperty('theInterface');
        expect(data.jsNames.functions.theInterface).toContain('primaryInterface');
        expect(data.jsNames.functions.theInterface).toContain('exposedOnTheInterface');
      })
      .catch(fail)
      .then(done);
  });
});