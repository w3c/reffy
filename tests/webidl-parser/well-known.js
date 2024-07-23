import assert from 'node:assert';
import { parse } from '../../src/cli/parse-webidl.js';

describe('When it parses well-known types, the WebIDL parser', () => {
  const someWellKnownTypes = ['undefined', 'boolean', 'DOMString', 'long long'];

  someWellKnownTypes.forEach(type => {
    it(`does not list \`${type}\` as a dependency`, async () => {
      const data = await parse(`
        interface test {
          ${type} doNothing();
        };
      `);
      assert(data?.dependencies?.test, 'dependencies does not list "test"');
      assert(data?.externalDependencies, 'externalDependencies is not set');
      assert.strictEqual(data.dependencies.test.length, 0);
      assert.strictEqual(data.externalDependencies.length, 0);
    });
  });
});