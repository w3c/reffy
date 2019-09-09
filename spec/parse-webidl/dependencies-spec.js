describe('The WebIDL parser returns accurate IDL dependencies', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('includes ', done => {
    parse(`
[Exposed=Window]
interface ExposedOnPrimaryWindow {};
        `)
      .then(data => {
        expect(data).toExportName('ExposedOnPrimaryWindow');
      })
      .catch(fail)
      .then(done);
  });
});