import { describe, it } from 'node:test';
import assert from 'node:assert';
import idlparsed from '../src/postprocessing/idlparsed.js';

describe('The parsed IDL generator', function () {
  it('leaves a spec without IDL intact', async () => {
    const spec = {};
    const result = await idlparsed.run(spec);
    assert.deepEqual(result, {});
  });

  it('parses raw IDL defined in the `idl` property', async () => {
    const idl = 'interface foo {};';
    const spec = { idl };
    const result = await idlparsed.run(spec);
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
    const result = await idlparsed.run(spec);
    assert.equal(result.idlparsed, `WebIDLParseError: Syntax error at line 1:
intraface foo {};
^ Unrecognised tokens`);
  });


  function getIdlSpecWithDfn(type) {
    return {
      dfns: [{
        href: 'about:blank/#foo',
        linkingText: ['foo'],
        localLinkingText: [],
        type: type.split(' ')[0],
        for: [],
        access: 'public',
        informative: false
      }],
      idl: `${type} foo {};`
    };
  }

  // Note: we could also test "enum", "typedef" and "callback" IDL types, but
  // the IDL syntax would need to be different (e.g., "enum foo {}" is invalid)
  for (const type of [
    'dictionary', 'interface', 'interface mixin',
    'callback interface', 'namespace'
  ]) {
    it(`links back to the definition in the spec when available (${type})`, async () => {
      const spec = getIdlSpecWithDfn(type);
      const result = await idlparsed.run(spec);
      assert.deepEqual(result?.idlparsed?.idlNames, {
        foo: {
          extAttrs: [],
          fragment: `${type} foo {};`,
          inheritance: null,
          members: [],
          name: 'foo',
          partial: false,
          type: type,
          href: 'about:blank/#foo'
        }
      });
    });
  }
});
