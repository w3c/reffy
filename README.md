# Reffy

Reffy is a **Web spec crawler and analyzer** tool. It is notably used to update [Webref](https://github.com/w3c/webref#webref) every 6 hours.

The code features a generic crawler that can fetch Web specifications and generate machine-readable extracts out of them, and a set of individual tools to study these extracts and create human-readable reports (such as the [crawl report in Webref](https://w3c.github.io/webref/ed/)). Created extracts include lists of CSS properties, definitions, IDL, links and references contained in the specification.


## How to use

### Pre-requisites

- To install Reffy, you need [Node.js](https://nodejs.org/en/).
- If you want to generate HTML reports, you need to install [Pandoc](http://pandoc.org/).

### Installation

Reffy is available as an NPM package. To install, run:

`npm install reffy`

This should install Reffy's command-line interface tools to Node.js path.

### Launch Reffy

To crawl all specs, generate a crawl report and an anomaly report, follow these steps:

1. To produce a report using Editor's Drafts, run `reffy run ed`.
2. To produce a report using latest published versions in `/TR/`, run `reffy run tr`.

Under the hoods, these commands run the following steps (and related commands) in turn:
1. **Crawling**: Crawls a list of spec and outputs relevant information extracts in the specified folder. See [Specs crawler](#specs-crawler) below for details.
2. **Analysis**: Analyses the result of the crawling step, and produces a study report. `study-crawl reports/ed/crawl.json [url]`. When the `url` parameter is given, the resulting analysis will only contain the results for the spec at that URL (multiple URLs may be given as a comma-separated value list without spaces). You will probably want to redirect the output to a file, e.g. using `study-crawl reports/ed/crawl.json > reports/ed/study.json`.
3. **Markdown report generation**: Produces a human-readable report in Markdown format out of the report returned by the analysis step, or directly out of results of the crawling step. `generate-report reports/ed/study.json [perspec|dep]`. By default, the tool generates a report per anomaly, pass `perspec` to create a report per specification and `dep` to generate a dependencies report. You will probably want to redirect the output to a file, e.g. using `generate-report reports/ed/study.json > reports/ed/index.md`.
4. **Conversion to HTML**: Takes the Markdown analysis per specification and prepares an HTML report with expandable sections. `pandoc reports/ed/index.md -f markdown -t html5 --section-divs -s --template report-template.html -o reports/ed/index.html` (where `report.md` is the Markdown report)
5. **Diff with latest published version of the crawl report**: Compares a crawl analysis with the latest published crawl analysis and produce a human-readable diff in Markdown format. `generate-report reports/ed/study.json diff https://w3c.github.io/webref/ed/study.json`

Some notes:

* The crawler may take some time
* The crawler uses a local cache for HTTP exchanges. It will create and fill a `.cache` subfolder in particular.

## Reffy's tools

### Specs crawler

The **Specs crawler** crawls requested specifications and runs a set of processing modules on the content fetched to create relevant extracts from each spec. Which specs get crawled, and which processing modules get run depend on how the crawler gets called. By default, the crawler crawls all specs defined in [browser-specs](https://github.com/w3c/browser-specs/) and runs all core processing modules defined in the [`browserlib`](https://github.com/w3c/reffy/tree/main/src/browserlib) folder.

Crawl results will either be returned to the console or saved in individual files in a report folder when the `--output` parameter is set.

Examples of information that can be extracted from the specs:

1. Generic information such as the title of the spec or the URL of the Editor's Draft. This information is typically copied over from [browser-specs](https://github.com/w3c/browser-specs/).
2. The list of terms that the spec defines, in a format suitable for ingestion in cross-referencing tools such as [ReSpec](https://respec.org/xref/).
3. The list of IDs, the list of headings and the list of links in the spec.
4. The list of normative/informative references found in the spec.
5. Extended information about WebIDL term definitions and references that the spec contains
6. For CSS specs, the list of CSS properties, descriptors and value spaces that the spec defines.

The crawler can be fully parameterized to crawl a specific list of specs and run a custom set of processing modules on them. For example:

- To extract the raw IDL defined in Fetch, run:
  ```bash
  crawl-specs --spec fetch --module idl
  ```
- To retrieve the list of specs that the HTML spec references, run (noting that crawling the HTML spec takes some time due to it being a multipage spec):
  ```bash
  crawl-specs --spec html --module refs`
  ```
- To extract the list of CSS properties defined in CSS Flexible Box Layout Module Level 1, run:
  ```bash
  crawl-specs --spec css-flexbox-1 --module css
  ```
- To extract the list of terms defined in WAI ARIA 1.2, run:
  ```bash
  crawl-specs --spec wai-aria-1.2 --module dfns
  ```
- To run an hypothetical `extract-editors.mjs` processing module and create individual spec extracts with the result of the processing under an `editors` folder for all specs in browser-specs, run:
  ```bash
  crawl-specs --output reports/test --module editors:extract-editors.mjs
  ```

You may add `--terse` (or `-t`) to the above commands to access the extracts directly.

Run `crawl-specs -h` for a complete list of options and usage details.


### Study tool

**Reffy's report study tool** takes the machine-readable report generated by the crawler, and creates a study report of *potential* anomalies found in the report. The study report can then easily be converted to a human-readable Markdown report. Reported potential anomalies are:

1. specs that do not seem to reference any other spec normatively;
2. specs that define WebIDL terms but do not normatively reference the WebIDL spec;
3. specs that contain invalid WebIDL terms definitions;
4. specs that use obsolete WebIDL constructs (e.g. `[]` instead of `FrozenArray`);
5. specs that define WebIDL terms that are *also* defined in another spec;
6. specs that use WebIDL terms defined in another spec without referencing that spec normatively;
7. specs that use WebIDL terms for which the crawler could not find any definition in any of the specs it studied;
8. specs that link to another spec but do not include a reference to that other spec;
9. specs that link to another spec inconsistently in the body of the document and in the list of references (e.g. because the body of the document references the Editor's draft while the reference is to the latest published version).

### WebIDL terms explorer

See the related **[WebIDLPedia](https://dontcallmedom.github.io/webidlpedia)** project and its [repo](https://github.com/dontcallmedom/webidlpedia).

### Other tools

Some of the tools that compose Reffy may also be used directly.

The **WebIDL parser** takes the relative path to an IDL extract and generates a JSON structure that describes WebIDL term definitions and references that the spec contains. The parser uses [WebIDL2](https://github.com/darobin/webidl2.js/) to parse the WebIDL content found in the spec. To run the WebIDL parser: `parse-webidl [idlfile]`

The **WebIDL names generator** takes the results of a crawl as input and creates a report per referenceable IDL name, that details the complete parsed IDL structure that defines the name across all specs. To run the generator: `generate-idlnames [crawl folder] [save folder]`

The **crawl results merger** merges a new JSON crawl report into a reference one. This tool is typically useful to replace the crawl results of a given specification with the results of a new run of the crawler on that specification. To run the crawl results merger: `merge-crawl-results [new crawl report] [reference crawl report] [crawl report to create]`

The **spec checker** takes the URL of a spec, a reference crawl report and the name of the study report to create as inputs. It crawls and studies the given spec against the reference crawl report. Essentially, it applies the **crawler**, the **merger** and the **study** tool in order, to produces the anomalies report for the given spec. Note the URL can check multiple specs at once, provided the URLs are passed as a comma-separated value list without spaces. To run the spec checker: `check-specs [url] [reference crawl report] [study report to create]`

For instance:

```bash
parse-webidl ed/idl/fetch.idl
check-specs https://www.w3.org/TR/webstorage/ reports/ed/crawl.json reports/study-webstorage.json
```

## Technical notes

Reffy should be able to parse most of the W3C/WHATWG specifications that define CSS and/or WebIDL terms (both published versions and Editor's Drafts). The tool may work with other types of specs, but has not been tested with any of them.

### List of specs to crawl

Reffy crawls specs defined in [w3c/browser-specs](https://github.com/w3c/browser-specs/). If you believe a spec is missing, please check the [Spec selection criteria](https://github.com/w3c/browser-specs/#spec-selection-criteria) and create an issue (or prepare a pull request) against the [w3c/browser-specs](https://github.com/w3c/browser-specs/) repository.

### Crawling a spec

Given some spec info, the crawler basically goes through the following steps:

1. Load the URL through Puppeteer.
2. If the document contains a "head" section that includes a link whose label looks like "single page", go back to step 2 and load the target of that link instead. This makes the crawler load the single page version of multi-page specifications such as HTML5.
3. If the document is a multi-page spec without a "single page" version, load the individual subpage and add their content to the bottom of the first page to create a single page version.
4. If the document uses ReSpec, let ReSpec finish its generation work.
5. Run internal tools on the generated document to build the relevant information.

The crawler processes 4 specifications at a time. Network and parsing errors should be reported in the crawl results.

### Config parameters

The crawler reads parameters from the `config.json` file. Optional parameters:

* `cacheRefresh`: set this flag to `never` to tell the crawler to use the cache entry for a URL directly, instead of sending a conditional HTTP request to check whether the entry is still valid. This parameter is typically useful when developing Reffy's code to work offline.
* `resetCache`: set this flag to `true` to tell the crawler to reset the contents of the local cache when it starts.


## Contributing

Authors so far are [François Daoust](https://github.com/tidoust/) and [Dominique Hazaël-Massieux](https://github.com/dontcallmedom/).

Additional ideas, bugs and/or code contributions are most welcome. Create [issues on GitHub](https://github.com/w3c/reffy/issues) as needed!


## Licensing

The code is available under an [MIT license](LICENSE).
