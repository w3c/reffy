const { buildBrowserlib } = require("../src/lib/util");

describe("The reffy.js browser library", function() {
  this.slow(2000);
  this.timeout(5000);

  it("can be generated out of code in src/browserlib", async () => {
    await buildBrowserlib();
  });
});