# Reffy

Reffy is your **Web spec dependencies exploration companion**. It features a short set of tools to study spec references as well as WebIDL term definitions and references found in Web specifications.

See [published reports](https://tidoust.github.io/reffy-reports/) for daily human-readable reports generated by Reffy.


## How to use

### Pre-requisites

- To install Reffy, you need [Node.js](https://nodejs.org/en/).
- If you want to generate HTML reports, you need to install [Pandoc](http://pandoc.org/).

### Installation

Reffy is available as an NPM package. To install, run:

`npm install reffy`

### Launch the crawler

This should install Reffy's command-line interface tools to Node.js path.

To launch the crawler and the report study tool, follow these steps:

1. To produce a report using Editor's Drafts, run `reffy run ed`.
2. To produce a report using latest published versions in `/TR/`, run `reffy run tr`.

Under the hoods, these commands run the following steps (and related commands) in turn:
1. **Crawling**: Crawls a list of spec and outputs relevant information in a JSON structure in the specified folder. `crawl-specs reports/ed [tr]`. Add `tr` to tell the crawler to load the latest published version of TR specifications instead of the latest Editor's Draft.
2. **Analysis**: Analyses the result of the crawling step, and produces a study report. `study-crawl reports/ed/crawl.json [url]`. When the `url` parameter is given, the resulting analysis will only contain the results for the spec at that URL (multiple URLs may be given as a comma-separated value list without spaces). You will probably want to redirect the output to a file, e.g. using `study-crawl reports/ed/crawl.json > reports/ed/study.json`.
3. **Markdown report generation**: Produces a human-readable report in Markdown format out of the report returned by the analysis step, or directly out of results of the crawling step. `generate-report reports/ed/study.json [perspec|dep]`. By default, the tool generates a report per anomaly, pass `perspec` to create a report per specification and `dep` to generate a dependencies report. You will probably want to redirect the output to a file, e.g. using `generate-report reports/ed/study.json > reports/ed/index.md`.
4. **Conversion to HTML**: Takes the Markdown analysis per specification and prepares an HTML report with expandable sections. `pandoc reports/ed/index.md -f markdown -t html5 --section-divs -s --template report-template.html -o reports/ed/index.html` (where `report.md` is the Markdown report)
5. **Diff with latest published version of the crawl report**: Compares the crawl results with the latest published crawl results and produce a human-readable diff in Markdown format. `generate-report reports/ed/crawl.json diff https://tidoust.github.io/reffy-reports/ed/crawl.json`

Some notes:

* The crawler may take some time
* The crawler uses a local cache for HTTP exchanges. It will create and fill a `.cache` subfolder in particular.

## Reffy's tools

### Specs crawler

**Reffy's crawler** takes an initial list of spec URLs as input and generates a machine-readable report with facts about each spec, including:

1. Generic information such as the title of the spec or the URL of the Editor's Draft. This information is typically extracted from the [W3C API](https://w3c.github.io/w3c-api/).
2. The list of normative/informative references found in the spec.
3. Extended information about WebIDL term definitions and references that the spec contains

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

The **references parser** takes the URL of a spec as input and generates a JSON structure that lists the normative and informative references found in the spec. To run the references parser: `parse-references [url]`

The **WebIDL extractor** takes the URL of a spec as input and outputs the IDL definitions found in the spec as one block of text. To run the extractor: `extract-webidl [url]`

The **WebIDL parser** takes the URL of a spec as input and generates a JSON structure that describes WebIDL term definitions and references that the spec contains. The parser uses [WebIDL2](https://github.com/darobin/webidl2.js/) to parse the WebIDL content found in the spec. To run the WebIDL parser: `parse-webidl [url]`

The **CSS definitions extractor** takes the URL of a spec as input and outputs the CSS definitions found in the spec in a JSON structure. To run the extractor: `extract-cssdfn [url]`

The **crawl results merger** merges a new JSON crawl report into a reference one. This tool is typically useful to replace the crawl results of a given specification with the results of a new run of the crawler on that specification. To run the crawl results merger: `merge-crawl-results [new crawl report] [reference crawl report] [crawl report to create]`

The **spec checker** takes the URL of a spec, a reference crawl report and the name of the study report to create as inputs. It crawls and studies the given spec against the reference crawl report. Essentially, it applies the **crawler**, the **merger** and the **study** tool in order, to produces the anomalies report for the given spec. Note the URL can check multiple specs at once, provided the URLs are passed as a comma-separated value list without spaces. To run the spec checker: `check-specs [url] [reference crawl report] [study report to create]`


For instance:

```bash
parse-references https://w3c.github.io/presentation-api/
extract-webidl https://www.w3.org/TR/webrtc/
extract-cssdfn https://www.w3.org/TR/css-fonts-4/
parse-webidl https://fetch.spec.whatwg.org/
check-specs https://www.w3.org/TR/webstorage/ reports/ed/crawl.json reports/study-webstorage.json
```

## Technical notes

**Reffy is still at an early stage of development**. It may crash from time to time.

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

Additional ideas, bugs and/or code contributions are most welcome. Create [issues on GitHub](https://github.com/tidoust/issues) as needed!


## Licensing

The code is available under an [MIT license](LICENSE).
