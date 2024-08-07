import { parse as parseIdl } from "./src/cli/parse-webidl.js";
import { crawlSpecs } from "./src/lib/specs-crawler.js";
import { expandCrawlResult } from "./src/lib/util.js";
import { mergeCrawlResults } from "./src/cli/merge-crawl-results.js";
import { isLatestLevelThatPasses } from "./src/lib/util.js";
import { getInterfaceTreeInfo } from "./src/lib/util.js";
import { getSchemaValidationFunction } from "./src/lib/util.js";
import postProcessor from "./src/lib/post-processor.js";

export {
  parseIdl,
  crawlSpecs,
  expandCrawlResult,
  mergeCrawlResults,
  isLatestLevelThatPasses,
  getInterfaceTreeInfo,
  getSchemaValidationFunction,
  postProcessor
};

export default {
  parseIdl,
  crawlSpecs,
  expandCrawlResult,
  mergeCrawlResults,
  isLatestLevelThatPasses,
  getInterfaceTreeInfo,
  getSchemaValidationFunction,
  postProcessor
};