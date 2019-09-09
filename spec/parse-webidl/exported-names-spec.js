describe('The WebIDL parser exports all IDL names', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('exports named definitions', done => {
    parse(`
        interface testInterface {};
        dictionary testDict {};
        enum testEnum { "one" };
        callback testCallback = void ();
        typedef string testTypedef;
        callback interface testCallbackInterface {};
        `)
      .then(data => {
        expect(data).toExportName('testInterface');
        expect(data).toExportName('testDict');
        expect(data).toExportName('testEnum');
        expect(data).toExportName('testCallback');
        expect(data).toExportName('testTypedef');
        expect(data).toExportName('testCallbackInterface');
      })
      .catch(fail)
      .then(done);
  });

  it('does not export partial named definitions', done => {
    parse(`
        partial interface testInterface {};
        partial dictionary testDict {};
        `)
      .then(data => {
        expect(data).not.toExportName('testInterface');
        expect(data).not.toExportName('testDict');
      })
      .catch(fail)
      .then(done);
  });
});