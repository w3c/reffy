describe('The WebIDL parser understands includes statements', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('does not choke on includes statements', done => {
    parse(`
interface Base {};
interface Extended {};
Extended includes Base;
        `)
      .then(data => {
        expect(data).toExportName('Extended');
      })
      .catch(fail)
      .then(done);
  });
});