module.exports = {
  parseIdl: require("./src/cli/parse-webidl").parse,
  crawlSpecs: require("./src/lib/specs-crawler").crawlList,
  expandCrawlResult: require("./src/lib/util").expandCrawlResult,
  mergeCrawlResults: require("./src/lib/util").mergeCrawlResults,
  isLatestLevelThatPasses: require("./src/lib/util").isLatestLevelThatPasses,
  getTreeInfo: require("./src/lib/util").getTreeInfo,
  postProcessor: require("./src/lib/post-processor")
};
