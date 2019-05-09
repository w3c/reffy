const css = require("../../src/lib/css-grammar-parser");
const fs = require("fs");
const expect = require('chai').expect;

const propDefs = fs.readFileSync("tests/css-grammar-parser/in", "utf-8").split("\n");
const propDefsOut = JSON.parse(fs.readFileSync("tests/css-grammar-parser/out.json", "utf-8"));

const results = propDefs.map(css.parsePropDefValue);
describe('Parser correctly parses grammar instances', () => {
  for(let i in results) {
    it(`parses property definition ${propDefs[i]} as expected`, () => {
      expect(results[i]).to.deep.equal(propDefsOut[i], `Parsing ${propDefs[i]} got ${JSON.stringify(results[i], null, 2)} instead of ${JSON.stringify(propDefsOut[i], null, 2)}`);
    });
  }
});
