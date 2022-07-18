module.exports = {
  parseIdl: require("./src/cli/parse-webidl").parse,
  crawlSpecs: require("./src/lib/specs-crawler").crawlSpecs,
  expandCrawlResult: require("./src/lib/util").expandCrawlResult,
  mergeCrawlResults: require("./src/lib/util").mergeCrawlResults,
  isLatestLevelThatPasses: require("./src/lib/util").isLatestLevelThatPasses,
  getInterfaceTreeInfo: require("./src/lib/util").getInterfaceTreeInfo,
  postProcessor: require("./src/lib/post-processor")
};
