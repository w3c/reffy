module.exports = {
  parseIdl: require("./src/cli/parse-webidl").parse,
  crawlSpecs: require("./src/lib/specs-crawler").crawlList,
  expandCrawlResult: require("./src/lib/util").expandCrawlResult,
  mergeCrawlResults: require("./src/lib/util").mergeCrawlResults,
  isLatestLevelThatPasses: require("./src/lib/util").isLatestLevelThatPasses,
  generateIdlNames: require("./src/cli/generate-idlnames").generateIdlNames,
  saveIdlNames: require("./src/cli/generate-idlnames").saveIdlNames,
  generateIdlParsed: require("./src/cli/generate-idlparsed").generateIdlParsed,
  saveIdlParsed: require("./src/cli/generate-idlparsed").saveIdlParsed
};
