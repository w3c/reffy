#!/usr/bin/env node
/**
 * The spec crawler takes a list of spec URLs as input, gathers some knowledge
 * about these specs (published versions, URL of the Editor's Draft, etc.),
 * fetches these specs, parses them, extracts relevant information that they
 * contain (such as the WebIDL they define, the list of specifications that they
 * reference, and links to external specs), and produces a crawl report with the
 * results of these investigations.
 *
 * Provided Reffy was installed as a global package, the spec crawler can be
 * called directly through:
 *
 * `reffy [options]`
 *
 * Use the `--help` option for usage instructions.
 *
 * If Reffy was not installed as a global package, call:
 *
 * `node reffy.js [options]`
 *
 * @module crawler
 */

import { Command } from 'commander';
import satisfies from 'semver/functions/satisfies.js';
import specs from 'web-specs' with { type: 'json' };
import packageConfig from './package.json' with { type: 'json' };
import { crawlSpecs } from './src/lib/specs-crawler.js';
import { modules } from './src/lib/post-processor.js';
import { loadJSON } from './src/lib/util.js';

// Warn if version of Node.js does not satisfy requirements
if (packageConfig.engines && packageConfig.engines.node &&
    !satisfies(process.version, packageConfig.engines.node)) {
  console.warn(`
[WARNING] Node.js ${process.version} detected but Reffy needs Node.js ${engines.node}.
          Please consider upgrading Node.js if the program crashes!`);
}


function parseModuleOption(input) {
    const parts = input.split(':');
    if (parts.length > 2) {
        console.error('Module input cannot have more than one ":" character');
        process.exit(2);
    }
    if (parts.length === 2) {
        return {
            href: parts[1],
            property: parts[0]
        };
    }
    else {
        return parts[0];
    }
}

async function parseSpecOption(input) {
    if (input === 'all') {
        return specs
            .filter(s => s.standing !== 'discontinued')
            .map(s => s.shortname)
    }
    else {
        const list = await loadJSON(input);
        return list ?? input;
    }
}

function parsePostOption(input) {
    if (input === 'core') {
      return modules;
    }
    else {
      return input;
    }
}


const program = new Command();
program
    .version(packageConfig.version)
    .usage('[options]')
    .description('Crawls and processes a list of Web specifications')
    .option('-d, --debug', 'debug mode, crawl one spec at a time')
    .option('-f, --fallback <json>', 'fallback data to use when a spec crawl fails')
    .option('-m, --module <modules...>', 'spec processing modules')
    .option('-o, --output <folder>', 'existing folder/file where crawl results are to be saved')
    .option('-p, --post <modules...>', 'post-processing modules')
    .option('-q, --quiet', 'do not report progress and other warnings to the console')
    .option('-r, --release', 'crawl release (TR) version of specs')
    .option('-s, --spec <specs...>', 'specs to crawl')
    .option('-t, --terse', 'output crawl results without metadata')
    .option('-u, --use-crawl <folder>', 'use given crawl result folder as input for post-processing')
    .action(async options => {
        if (!(options.output || options.module || options.spec || options.useCrawl)) {
          console.error(`
At least one of the --output, --module, --spec or --use-crawl options needs to be
specified. For usage notes, run:
  reffy --help

If you really want to crawl all specs, run all processing modules and report the
JSON outcome to the console, you may run the following command but note that it
will dump ~100MB of data to the console:
  reffy --spec all
`);
          process.exit(2);
        }
        const crawlOptions = {
            debug: options.debug,
            fallback: options.fallback,
            output: options.output,
            publishedVersion: options.release,
            quiet: options.quiet,
            terse: options.terse,
            useCrawl: options.useCrawl
        };
        if (options.module) {
            crawlOptions.modules = options.module.map(parseModuleOption);
        }
        if (options.spec) {
            crawlOptions.specs = (await Promise.all(options.spec.map(parseSpecOption))).flat();
        }
        else {
            crawlOptions.specs = await parseSpecOption('all');
        }
        if (options.post) {
            crawlOptions.post = options.post.map(parsePostOption).flat();
        }

        if (crawlOptions.terse && crawlOptions.output) {
            console.error('The --terse option cannot be combined with the --output option');
            process.exit(2);
        }
        if (crawlOptions.terse && (!crawlOptions.modules || crawlOptions.modules.length === 0 || crawlOptions.modules.length > 1)) {
            console.error('The --terse option can only be set when only one core processing module runs');
            process.exit(2);
        }
        crawlSpecs(crawlOptions)
            .then(_ => {
                process.exit(0);
            })
            .catch(err => {
                console.error(err);
                process.exit(1);
            });
    })
    .showHelpAfterError('(run with --help for usage information)')
    .addHelpText('after', `
Minimal usage example:
  To crawl all known specs, run all processing modules, and save generated
  extracts to the current folder, run:
    $ reffy -o .

Description:
  Crawls a set of specifications and runs processing modules against each of
  them to generate extracts.

  Crawl results are written to the console as a serialized JSON array with one
  entry per spec by default. The order of the specs in the array matches the
  order of the specs provided as input (or the order of the specs in
  browser-specs if no explicit spec was provided).

  Resulting array may be large. Crawling all specs with core processing module
  produces ~100MB of serialized JSON for instance. To avoid janking the console
  or running into possible memory issues, setting the --output option is
  strongly recommended.

Usage notes for some of the options:
-f, --fallback <jsondata>
  Provides an existing JSON crawl data file to use as a source of fallback data
  for specs that fail to be crawled.

  The fallback data gets copied as-is. It is the responsibility of the caller
  to make sure that extracts it may link to actually exist and match the ones
  that the crawl would produce in the absence of errors (e.g. same modules).

  The "error" property is set on specs for which fallback data was used.

-m, --module <modules...>
  If processing modules are not specified, the crawler runs all core processing
  modules defined in:
    https://github.com/w3c/reffy/blob/main/src/browserlib/reffy.json

  Modules must be specified using a relative path to an ".mjs" file that defines
  the processing logic to run on the spec's page in a browser context. For
  instance:
    $ reffy --output reports/test --module extract-editors.mjs

  Absolute paths to modules are not properly handled and will likely result in a
  crawling error.

  Multiple modules can be specified, repeating the option name or not:
    $ reffy -o reports/test -m extract-words.mjs extract-editors.mjs
    $ reffy -o reports/test -m extract-words.mjs -m extract-editors.mjs

  Core processing modules may be referenced using the name of the extract folder
  or property that they would create:
    $ reffy --output reports/test --module dfns

  To run all core processing modules, use "core". For instance, to apply a
  processing module on top of core processing modules, use:
    $ reffy --output reports/test --module core extract-editors.mjs

  Each module must export a function that takes a spec object as input and
  return a result that can be serialized as JSON. A typical module code looks
  like:
    https://github.com/w3c/reffy/blob/main/src/browserlib/extract-ids.mjs

  Individual extracts will be created under "<folder>/[camelCaseModule]" where
  "[camelCaseModule]" is derived from the module's filename. For instance:
    "extract-editors.mjs" creates extracts under "<folder>/extractEditors"

  The name of the folder where extracts get created may be specified for custom
  modules by prefixing the path to the module with the folder name followed by
  ":". For instance, to save extracts to "reports/test/editors", use:
    $ reffy --output reports/test --module editors:extract-editors.mjs

-o, --output <folder>
  By default, crawl results are written to the console as a serialized JSON
  array with one entry per spec, and module processing results attached as
  property values in each of these entries.

  If an output <folder> is specified, crawl results are rather saved to that
  folder, with module processing results created under subfolders (see the
  --module option) and linked from an index.json file created under <folder>.

  Additionally, if an output <folder> is specified and if the IDL processing
  module is run, the crawler will also creates an index of IDL names named
  "idlnames.json" that links to relevant extracts in subfolders.

  The folder targeted by <folder> must exist.

-p, --post <modules...>
  Post-processing modules either run after a spec is done crawling or after the
  entire crawl is over. They allow developers to complete data based on other
  extracts that were not available when extraction ran.

  To run all core post-processing modules, use "core". Core post-processing
  modules are defined in:
    https://github.com/w3c/reffy/blob/main/src/postprocessing.js

  The crawler does not run any post-processing modules by default.

  Custom post-processing modules may be specified using a relative path to a
  ".js" file that defines the post-processing logic. For instance:
    $ reffy --output reports/test --post mypostprocessing.js

  Each module must export a "run" function. See the post-processor's code for
  details:
    https://github.com/w3c/reffy/blob/main/src/lib/post-processor.js

  Absolute paths to modules are not properly handled and will likely result in a
  processing error.

  Multiple post-processing modules can be specified, repeating the option name
  or not:
    $ reffy -o reports/test -p cssdfns cssidl events
    $ reffy -o reports/test -p events -p idlparsed -p idlnames

-r, --release
  The crawler defaults to crawling the nightly version of requested specs.
  Set this flag to tell the crawler to crawl the published version of the specs
  instead. When the flag is set, the crawler will ignore specs that do not have
  a published version.

-s, --spec <specs...>
  If specs to crawl are not specified, all specs in browser-specs that are not
  identified as being discontinued get crawled:
    https://github.com/w3c/browser-specs/

  Valid spec values may be a shortname, a URL, or a relative path to a file that
  contains a list of spec URLs and/or shortnames. All shortnames must exist in
  browser-specs. Shortname may be the shortname of the spec series, in which
  case the spec identified as the current specification in the series is used.
  For instance, as of September 2021, "pointerlock" will map to "pointerlock-2"
  because Pointer Lock 2.0 is the current level in the series.

  Use "all" to include all specs in browser-specs in the crawl. For instance, to
  crawl all specs plus one custom spec that does not exist in browser-specs:
    $ reffy -o reports/test -s all https://example.org/myspec

  When "all" is used, to force a crawl on some of the discontinued specs too,
  include their shortname explicitly (or point to a JSON file that lists their
  shortnames). For instance, to also crawl the discontinued DOM Level 2 Style
  spec, run:
    $ reffy -o reports/test -s all DOM-Level-2-Style

-t, --terse
  This flag cannot be combined with the --output option and cannot be set if
  more than one processing module gets run. When set, the crawler writes the
  processing module results to the console directly without wrapping them with
  spec metadata. In other words, the spec entry in the crawl results directly
  contains the outcome of the processing module when the flag is set.

  Additionally, if crawl runs on a single specification, the array is omitted
  and the processing module results are thus written to the console directly.
  For instance:
    $ reffy --spec fetch --module idl --terse

-u, --use-crawl <folder>
  Tells Reffy to skip the crawl part and only run requested post-processing
  modules on the crawl results present in the specified folder.

  If post-processing modules are not specified, Reffy will merely copy the crawl
  results to the output folder (or to the console).
`);

program.parse(process.argv);
