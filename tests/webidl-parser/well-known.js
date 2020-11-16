const { expect } = require('chai');

describe('When it parses well-known types, the WebIDL parser', () => {
  const parse = require('../../src/cli/parse-webidl').parse;

  const someWellKnownTypes = ['undefined', 'boolean', 'DOMString', 'long long'];

  someWellKnownTypes.forEach(type => {
    it(`does not list \`${type}\` as a dependency`, async () => {
      const data = await parse(`
        interface test {
          ${type} doNothing();
        };
      `);
      expect(data).to.be.an('object').with.property('dependencies');
      expect(data.dependencies).to.have.property('test');
      expect(data.dependencies.test).to.have.length(0);
      expect(data).to.be.an('object').with.property('externalDependencies');
      expect(data.externalDependencies).to.have.length(0);
    });
  });
});