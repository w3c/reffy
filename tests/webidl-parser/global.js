const assert = require('assert');

describe('For Global/Exposed attributes, the WebIDL parser', () => {
  var parse = require('../../src/cli/parse-webidl').parse;

  it('does not expose an interface on Window by default', async () => {
    const data = await parse(`
      interface notExposedOnWindow {};
    `);
    assert(data?.jsNames?.functions, 'jsNames.functions property is missing');
    assert(!data.jsNames.functions.hasOwnProperty('Window'), 'jsNames.functions.Window should not be set');
    assert.deepStrictEqual(data.globals, {}, 'Globals should be an empty object');
    assert.deepStrictEqual(data.exposed, {}, 'Exposed should be an empty object');
  });

  it('detects a simple global definition and reference to it', async () => {
    const data = await parse(`
      [Global=primaryInterface]
      interface primaryInterface {};

      [Exposed=primaryInterface]
      interface exposedOnPrimaryInterface {};
    `);
    assert(data?.globals?.primaryInterface?.includes('primaryInterface'), 'globals.primaryInterface is not set or does not contain "primaryInterface"');
    assert(data?.exposed?.primaryInterface?.includes('exposedOnPrimaryInterface'), 'exposed.primaryInterface is not set or does not contain "exposedOnPrimaryInterface"');
    assert(data?.jsNames?.functions?.primaryInterface?.includes('exposedOnPrimaryInterface'), 'jsNames.functions.primaryInterface is not set or does not contain "exposedOnPrimaryInterface"');
  });

  it('uses the right name for a global interface definition', async () => {
    const data = await parse(`
      [Global=theInterface, Exposed=theInterface]
      interface anInterface {};
    `);
    assert(data?.globals?.theInterface?.includes('anInterface'), 'globals.theInterface is not set or does not contain "anInterface"');
    assert(!data.globals.anInterface, 'globals.anInterface should not be set');
    assert(data?.exposed?.theInterface?.includes('anInterface'), 'exposed.theInterface is not set or does not contain "anInterface"');
    assert(!data?.exposed?.anInterface, 'exposed.anInterface should not be set');
    assert(data?.jsNames?.functions?.theInterface?.includes('anInterface'), 'jsNames.functions.theInterfaces is not set or does not contain "anInterface"');
  });

  it('understands multiple names for a global interface definition', async () => {
    const data = await parse(`
      [Global=(theInterface,sameInterface), Exposed=theInterface]
      interface anInterface {};
    `);
    assert(data?.globals?.theInterface?.includes('anInterface'), 'globals.theInterface is not set or does not contain "anInterface"');
    assert(data?.globals?.sameInterface?.includes('anInterface'), 'globals.sameInterface is not set or does not contain "anInterface"');
    assert(!data?.globals?.anInterface, 'globals.anInterface should not be set');
    assert(data?.exposed?.theInterface?.includes('anInterface'), 'exposed.theInterface is not set or does not contain "anInterface"');
    assert(!data?.exposed?.sameInterface, 'exposed.sameInterface should not be set');
    assert(!data?.exposed?.anInterface, 'exposed.anInterface should not be set');
    assert(data?.jsNames?.functions?.theInterface?.includes('anInterface'), 'jsNames.functions.theInterface is not set or does not contain "anInterface"');
    assert(!data?.jsNames?.functions?.sameInterface, 'jsNames.functions.sameInterface should not be set');
  });

  it('parses the Exposed=* extended attribute correctly', async () => {
    const data = await parse(`
      [Exposed=*]
      interface anInterface {};
    `);
    assert(data?.exposed?.['*'], 'exposed is not set or does not have a "*" property');
  });
});
