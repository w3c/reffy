import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parse } from '../../src/cli/parse-webidl.js';

describe('The WebIDL parser understands includes statements', () => {
  it('does not choke on includes statements', async () => {
    const data = await parse(`
interface Base {};
interface Extended {};
Extended includes Base;
    `);
    assert(data?.idlNames?.Extended, 'idlNames.Extended is not set');
  });
});
