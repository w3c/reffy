const css = require("../../src/lib/css-grammar-parser");
const fs = require("fs");
const assert = require("assert");

const propDefs = fs.readFileSync("tests/css-grammar-parser/in", "utf-8").split("\n").map(def => def.trim());
const propDefsOut = JSON.parse(fs.readFileSync("tests/css-grammar-parser/out.json", "utf-8"));

const results = propDefs.map(css.parsePropDefValue);
describe('Parser correctly parses grammar instances', () => {
  for(let i in results) {
    it(`parses property definition ${propDefs[i]} as expected`, () => {
      assert.deepStrictEqual(results[i], propDefsOut[i], `Parsing ${propDefs[i]} got ${JSON.stringify(results[i], null, 2)} instead of ${JSON.stringify(propDefsOut[i], null, 2)}`);
    });
  }
});
