# Changelog

This file documents breaking changes introduced in major releases of Reffy.
Minor and patch release notes are currently only documented in
[Git commits](https://github.com/w3c/reffy/search?o=desc&q=Release+version+of+Reffy&s=committer-date&type=commits).

Reffy adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v13.0.0 - 2023-04-24

### Breaking changes

- Bump minimal supported version of Node.js from v14 to v18 ([#1271](https://github.com/w3c/reffy/pull/1271))

Required by dependency on ReSpec, although note this dependency is only for tests (`devDependencies` in `package.json`). The crawler itself should continue to run under previous versions of Node for now but this may not last!

### Dependency bumps

- Bump respec from 32.8.0 to 34.0.1 ([#1270](https://github.com/w3c/reffy/pull/1270)). This triggers the need to bump the minimal supported version of Node.js.
- Bump puppeteer from 19.9.1 to 19.10.1 ([#1267](https://github.com/w3c/reffy/pull/1267))
- Bump rollup from 3.20.4 to 3.20.7 ([#1266](https://github.com/w3c/reffy/pull/1266))
- Bump semver from 7.4.0 to 7.5.0 ([#1264](https://github.com/w3c/reffy/pull/1264))

### Feature patches

- Events: Skip asides in "fire an event" phrasing ([#1269](https://github.com/w3c/reffy/pull/1269))


## v12.0.0 - 2023-02-24

### Breaking changes

- Skip non-published specs when `--release` option is set ([#1214](https://github.com/w3c/reffy/pull/1214))

The change is breaking in that a crawl on released versions of specs no longer
contains info about specs that do not have a released version. For example,
specs that only exist as living standards such as WHATWG specs are no longer
crawled when the `--release` option is set. The `--release` option is typically
used to run a crawl that completes a crawl on the nightly versions of specs.
Goal of the change is to avoid crawling specs that are already in the nightly
crawl.

Crawl results are unaltered otherwise. Tools that use Reffy should only need to
update their logic if they expect a `--release` crawl to also yield info about
non-released specs.

### Feature patches

- ECMAScript spec: Fix dfn scoping and abstract op extraction ([#1217](https://github.com/w3c/reffy/pull/1217))
- Drop legacyValue extraction logic ([#1218](https://github.com/w3c/reffy/pull/1218))
- Encode URI fragments ([#1216](https://github.com/w3c/reffy/pull/1216))


## v11.0.0 - 2022-11-28

This new major version modifies and completes the CSS extraction logic. See
[#1117](https://github.com/w3c/reffy/pull/1117) for details.

No other change was made, meaning breaking and non-breaking changes **only
affect CSS extracts**.

### Breaking changes

- Arrays are now used throughout instead of indexed objects.
- Function names are no longer enclosed in `<` and `>` because they are not
defined in specs with these characters (as opposed to types). Beware though,
references to functions in value syntax do use enclosing `<` and `>` characters.
- The property `valuespaces` at the root level is now named `values`. An array
is used there as well. The `values` property lists both `function` and `type`
definitions that are not namespaced to anything in particular (it used to also
contain namespaced definitions).

### Added

- Selectors are now reported under a `selectors` property at the root level.
- Possible values that some definition may take are now reported under a
`values` property directly within the definition.
- Functions and types that are namespaced to some other definition are included
in the list of `values` of that definition.
- Anomalies detected in the spec are now reported under a `warnings` property at
the root of the extract. Four types of anomalies are reported:
  1. **Missing definition**: when a production rule was found but when the spec
  does not include a corresponding `<dfn>` (or when that `<dfn>` does not have a
  `data-dfn-type` attribute that identifies a CSS construct)
  2. **Duplicate definition**: when the spec defines the same term twice.
  3. **Unmergeable definition**: when the spec defines the same property twice
  and both definitions cannot be merged.
  4. **Dangling value**: when the spec defines a CSS "value" definition
  (`value`, `function` or `type`) for something and that something cannot be
  found in the spec
- To distinguish between `function`, `type` and `value` definitions listed in a
`values` property, definitions that appear in a `values` property have a `type`
property.

### Additional notes

- Only namespaced values associated with a definition are listed under its
`values` property. Non-namespaced values are not. For instance, `<quote>` is not
listed as a value of the `<content-list>` type, even though its value syntax
references it. This is to avoid duplicating constructs in the extracts.
- Values are only listed under the deepest definition to which they apply. For
instance, `open-quote` is only listed as a value of `<quote>` but neither as a
value of the `<content-list>` type that references `<quote>` nor as a value of
the `content` property that references `<content-list>`. This is also to avoid
duplicating constructs in the extracts.
- Some of the extracts contain things that may look weird at first, but that is
"by design". For instance, [CSS Will
change](https://drafts.csswg.org/css-will-change-1/) defines a
[`<custom-ident>`](https://drafts.csswg.org/css-will-change-1/#valdef-will-change-custom-ident)
`value` construct whose actual value is the `<custom-ident>` `type` construct
defined in CSS Values. Having both a namespaced `value` and a non-namespaced
`<type>` is somewhat common in CSS specs.


## v10.0.0 - 2022-09-06

Links extracts were restructured to keep original links. See
[#1055](https://github.com/w3c/reffy/pull/1055) for details.

### Breaking changes

- Links extracts now use an object with an `anchors` property that lists the
said anchors, instead of being listed directly as an array.


## v9.0.0 - 2022-08-17

CSS extracts were restructured to report at-rules and move descriptors under the
at-rule they are for. See [#1033](https://github.com/w3c/reffy/pull/1033) for
details.

### Breaking changes

- The former `descriptors` property that appeared at the root level of the
extract no longer exists. The same info can be found under the new `atrules`
property.

### Added

- At-rules defined by the specification are now reported under an `atrules`
property at the root level.


## v8.0.0 - 2022-07-18

This new version splits crawl into a processing step and a post-processing
step. See [#1015](https://github.com/w3c/reffy/pull/1015) for details.

### Breaking changes

- Reffy no longer completes CSS extracts per default to add generated IDL
attributes and add properties defined in prose. Run the crawler with the
`csscomplete` post-processing module to get the same result. Note the
`csscomplete` module will look at `dfns` extracts to add properties defined in
prose. In other words, command line should include something like:
`--module dfns --post csscomplete` (or not mention `--module` at all as Reffy
runs all crawl modules by default)
- Reffy no longer outputs parsed CSS structures to the console when CSS
extraction runs. This was not used anywhere. It would be trivial to do this in
a post-processing module if that seems needed.
- Reffy no longer produces "idlparsed" and "idlnames" extracts per default. Run
the crawler with the `idlparsed` and `idlnames` post-processing modules. The
`idlparsed` module needs `idl` extracts to run. The `idlnames` module needs
`idlparsed` extracts to run. In other words, command line should include
something like: `--module idl --post idlparsed --post idlnames` (or not mention
`--module` at all as Reffy runs all crawl modules by default)
- Reffy saves events extracts to an `events` folder again (instead of
`spec-events`). Events extraction and events merging should be viewed as a
beta feature for now, likely to be improved in future versions of Reffy.


## v7.0.0 - 2022-03-09

Major version release triggered by the major bump of `web-specs` that changes
the semantics of the `seriesComposition` property, reported in the crawl.
See [w3c/browser-specs#535](https://github.com/w3c/browser-specs/pull/535) for
details.


## v6.0.0 - 2022-01-07

New major version released following the recent commit that separates the raw
IDL and the parsed IDL structure in the in-memory model of a crawled spec. See
[commit 747df3c](https://github.com/w3c/reffy/commit/747df3cd8b1777f5e5398069998f4fbde534e39c)
for details.

## Breaking changes

- No change to generated extracts but the spec object returned by the
`expandCrawlResults` function is slightly different. The parsed IDL structure
used to be found under `spec.idl` and the raw IDL in `spec.idl.idl`. The parsed
IDL structure now appears under `spec.idlparsed` and the raw IDL in `spec.idl`.

## Added

- New tool: parsed IDL generator (in `src/cli`)

## Fixed

- Serialize Puppeteer setup/teardowns
- Improve network interception test logic