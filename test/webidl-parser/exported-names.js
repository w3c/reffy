import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parse } from '../../src/cli/parse-webidl.js';

describe('The WebIDL parser exports all IDL names', () => {
  it('exports named definitions', async () => {
    const data = await parse(`
      interface testInterface {};
      dictionary testDict {};
      enum testEnum { "one" };
      callback testCallback = void ();
      typedef string testTypedef;
      callback interface testCallbackInterface {};
    `);
    assert(data?.idlNames?.testInterface, 'testInterface property is missing');
    assert(data?.idlNames?.testDict, 'testDict property is missing');
    assert(data?.idlNames?.testEnum, 'testEnum property is missing');
    assert(data?.idlNames?.testCallback, 'testCallback property is missing');
    assert(data?.idlNames?.testCallbackInterface, 'testCallbackInterface property is missing');
  });

  it('does not export partial named definitions', async () => {
    const data = await parse(`
      partial interface testInterface {};
      partial dictionary testDict {};
    `);
    assert(data?.idlNames, 'idlNames property is missing');
    assert(!data.idlNames.testInterface, 'testInterface property should not exist');
    assert(!data.idlNames.testDict, 'testDict property should not exist');
  });
});
