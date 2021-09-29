module.exports = {
  parseIdl: require("./src/cli/parse-webidl").parse,
  crawlSpecs: require("./src/lib/specs-crawler").crawlList
};
