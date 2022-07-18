const { assert } = require('chai');
const { run } = require('../src/postprocessing/idlparsed');

describe('The parsed IDL generator', function () {
  it('leaves a spec without IDL intact', async () => {
    const spec = {};
    const result = await run(spec);
    assert.deepEqual(result, {});
  });

  it('parses raw IDL defined in the `idl` property', async () => {
    const idl = 'interface foo {};';
    const spec = { idl };
    const result = await run(spec);
    assert.deepEqual(result?.idlparsed?.idlNames, {
      foo: {
        extAttrs: [],
        fragment: 'interface foo {};',
        inheritance: null,
        members: [],
        name: 'foo',
        partial: false,
        type: 'interface'
      }
    });
  });

  it('reports IDL parsing errors', async () => {
    const idl = 'intraface foo {};';
    const spec = { idl };
    const result = await run(spec);
    assert.equal(result.idlparsed, `WebIDLParseError: Syntax error at line 1:
intraface foo {};
^ Unrecognised tokens`);
  });
});