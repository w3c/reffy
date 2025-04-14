import assert from 'node:assert';
import { generateSpecReport } from '../src/lib/markdown-report.js';
import crawlTest from './crawl-test.json' with { type: 'json' };

describe('The markdown report', () => {
  it('produces a suitable summary', async () => {
    const specResult = crawlTest[0];
    assert.strictEqual(await generateSpecReport(crawlTest[0]), `Crawl summary:
- Title: WOFF2
- Canonical URL: [https://www.w3.org/TR/WOFF2/](https://www.w3.org/TR/WOFF2/)
- Crawled URL: [https://w3c.github.io/woff/woff2/](https://w3c.github.io/woff/woff2/)
- Spec defines:
  - Headings: 1 found
  - IDs: 2 found
  - Links: 1 rawlinks
  - Terms: 1 private
- No Algorithms, CDDL, CSS, Events, References, Web IDL definitions found`);
  });


  it('produces CSS details', async () => {
    const specResult = Object.assign({}, crawlTest[0], {
      css: {
        atrules: [
          {
            name: '@charset',
            href: 'https://drafts.csswg.org/css-syntax-3/#at-ruledef-charset'
          }
        ],
        properties: [
          {
            name: 'block-step-size',
            href: 'https://drafts.csswg.org/css-rhythm-1/#propdef-block-step-size',
            value: 'none | <length [0,∞]>',
            initial: 'none'
          }
        ],
        selectors: [
          {
            name: ':host',
            href: 'https://drafts.csswg.org/css-scoping-1/#selectordef-host'
          }
        ]
      }
    });
    assert.strictEqual(await generateSpecReport(specResult), `Crawl summary:
- Title: WOFF2
- Canonical URL: [https://www.w3.org/TR/WOFF2/](https://www.w3.org/TR/WOFF2/)
- Crawled URL: [https://w3c.github.io/woff/woff2/](https://w3c.github.io/woff/woff2/)
- Spec defines:
  - CSS: 1 property, 1 at-rule, 1 selector
  - Headings: 1 found
  - IDs: 2 found
  - Links: 1 rawlinks
  - Terms: 1 private
- No Algorithms, CDDL, Events, References, Web IDL definitions found

<details>
<summary>1 CSS property</summary>

- [\`block-step-size\`](https://drafts.csswg.org/css-rhythm-1/#propdef-block-step-size) ([xref search](https://respec.org/xref/?term=block-step-size&types=css-at-rule%2Ccss-descriptor%2Ccss-function%2Ccss-property%2Ccss-selector%2Ccss-type%2Ccss-value))
</details>
<details>
<summary>1 CSS at-rule</summary>

- [\`@charset\`](https://drafts.csswg.org/css-syntax-3/#at-ruledef-charset) ([xref search](https://respec.org/xref/?term=%40charset&types=css-at-rule%2Ccss-descriptor%2Ccss-function%2Ccss-property%2Ccss-selector%2Ccss-type%2Ccss-value))
</details>
<details>
<summary>1 CSS selector</summary>

- [\`:host\`](https://drafts.csswg.org/css-scoping-1/#selectordef-host) ([xref search](https://respec.org/xref/?term=%3Ahost&types=css-at-rule%2Ccss-descriptor%2Ccss-function%2Ccss-property%2Ccss-selector%2Ccss-type%2Ccss-value))
</details>`);
  });


  it('produces dfns details', async () => {
    const dfn1 = Object.assign({}, crawlTest[0].dfns[0], { access: 'public' });
    const dfn2 = Object.assign({}, dfn1, { type: 'attribute', for: ['Bar'] });
    const specResult = Object.assign({}, crawlTest[0], { dfns: [dfn1, dfn2] });
    assert.strictEqual(await generateSpecReport(specResult), `Crawl summary:
- Title: WOFF2
- Canonical URL: [https://www.w3.org/TR/WOFF2/](https://www.w3.org/TR/WOFF2/)
- Crawled URL: [https://w3c.github.io/woff/woff2/](https://w3c.github.io/woff/woff2/)
- Spec defines:
  - Headings: 1 found
  - IDs: 2 found
  - Links: 1 rawlinks
  - Terms: 1 explicitly exported, 1 exported by default
- No Algorithms, CDDL, CSS, Events, References, Web IDL definitions found

<details>
<summary>1 explicitly exported term</summary>

- [Foo](https://w3c.github.io/woff/woff2/#foo), type dfn ([xref search](https://respec.org/xref/?term=Foo))
</details>`);
  });


  it('produces IDL details', async () => {
    const specResult = Object.assign({}, crawlTest[0], {
      idl: `
[SecureContext, Exposed=Window]
interface Presentation {
};

partial interface Presentation {
  attribute PresentationRequest? defaultRequest;
};

partial interface Presentation {
  readonly attribute PresentationReceiver? receiver;
};

dictionary PresentationConnectionAvailableEventInit : EventInit {
  required PresentationConnection connection;
};

enum PresentationConnectionState { "connecting", "connected", "closed", "terminated" };
  ` });
    assert.strictEqual(await generateSpecReport(specResult), `Crawl summary:
- Title: WOFF2
- Canonical URL: [https://www.w3.org/TR/WOFF2/](https://www.w3.org/TR/WOFF2/)
- Crawled URL: [https://w3c.github.io/woff/woff2/](https://w3c.github.io/woff/woff2/)
- Spec defines:
  - Headings: 1 found
  - IDs: 2 found
  - Links: 1 rawlinks
  - Terms: 1 private
  - Web IDL: 3 names (or partials)
- No Algorithms, CDDL, CSS, Events, References definitions found

<details>
<summary>3 Web IDL names</summary>

- interface \`Presentation\` ([xref search](https://respec.org/xref/?term=Presentation&types=_IDL_))
- dictionary \`PresentationConnectionAvailableEventInit\` ([xref search](https://respec.org/xref/?term=PresentationConnectionAvailableEventInit&types=_IDL_))
- enum \`PresentationConnectionState\` ([xref search](https://respec.org/xref/?term=PresentationConnectionState&types=_IDL_))
</details>`);
  });
});