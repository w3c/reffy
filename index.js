module.exports = {
  extractIdl: require("./src/cli/extract-webidl.js").extract,
  parseIdl: require("./src/cli/parse-webidl").parse
  crawlSpecs: require("./src/cli/crawl-specs").crawlList,
};
