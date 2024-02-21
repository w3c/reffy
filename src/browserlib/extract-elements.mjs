import getAbsoluteUrl from './get-absolute-url.mjs';

/**
 * Extract the list of markup elements that the spec defines
 *
 * Extraction requires spec to follow a structure similar to the one used in
 * the HTML spec:
 * https://html.spec.whatwg.org/multipage/dom.html#element-definitions
 *
 * Important (2021-05-31): Extraction code is incomplete and only extracts the
 * mapping between each element and its associated IDL interface for now. The
 * rest of the extraction logic is currently disabled because it does not yet
 * produce fully machine-readable results, see inline comments prefixed with
 * "TODO" for details.
 *
 * @function
 * @public
 */
export default function (spec) {
  function getText(el) {
    return el.textContent.trim().replace(/\s+/g, ' ');
  }

  // Extract HTML elements
  const htmlElements = [...document.querySelectorAll('dl.element')]
    .map(el => {
      // Get back to heading that defines the element(s)
      let heading = el.previousElementSibling;
      while (heading && !heading.nodeName.match(/^H\d$/)) {
        heading = heading.previousElementSibling;
      }
      if (!heading) {
        throw new Error('Could not locate heading associated with element');
      }

      const dfns = [...heading.querySelectorAll('dfn')];
      if (dfns.length === 0) {
        // Ignore the definition of "Custom elements" in HTML
        if (getText(heading).match(/Core concepts/)) {
          return null;
        }
        throw new Error('No dfn found in heading element: ' + heading.textContent);
      }

      // In most cases, there will be only one element, but some elements are
      // defined together, typically h1-h6 or sub and sup
      return dfns.map(dfn => {
        const res = {
          name: getText(dfn),
          href: getAbsoluteUrl(dfn)
        };
        const dts = [...el.querySelectorAll('dt')];
        dts.forEach(dt => {
          const prop = ({
            // TODO: Properties other than "interface" follow common patterns
            // most of the time... but not always, making it hard to  create
            // fully machine-readable info. Uncomment following lines to extract
            // more info and improve the code
            // 'Categories': 'categories',
            // 'Contexts in which this element can be used': 'contexts',
            // 'Content model': 'contents',
            // 'Tag omission in text/html': 'omission',
            // 'Content attributes': 'attributes',
            // 'Accessibility considerations': 'accessibility',
            'DOM interface': 'interface'
          })[getText(dt).replace(/:$/, '')];

          if (prop === 'omission') {
            // Tag omission can be a complex paragraph but it is never a list.
            let dd = dt.nextElementSibling;
            while (dd && dd.nodeName !== 'DD') {
              dd = dd.nextElementSibling;
            }
            if (dd) {
              res[prop] = getText(dd);
            }
          }
          else if (prop === 'accessibility') {
            // TODO: Accessibility considerations links to ARIA and AAM. The
            // code does not yet handle more complex associations that currently
            // appear in the definitions of the img, sub and sup, input and
            // select elements.
            res[prop] = [];
            let dd = dt.nextElementSibling;
            while (dd && dd.nodeName !== 'DT') {
              if (dd.nodeName === 'DD') {
                const link = dd.querySelector('a');
                if (link) {
                  res[prop].push({
                    title: getText(link),
                    href: link.getAttribute('href')
                  });
                }
              }
              dd = dd.nextElementSibling;
            }
          }
          else if (prop === 'interface') {
            let dd = dt.nextElementSibling;
            while (dd && dd.nodeName !== 'DD') {
              dd = dd.nextElementSibling;
            }
            if (dd) {
              let match = dd.textContent.match(/^interface (.*?) /m);
              if (match) {
                res[prop] = match[1];
              }
              else {
                // NB: The sub/sup table uses a plural form for "Use", hence
                // the "?" for the final "s" in "Uses".
                match = dd.textContent.match(/^Uses? (.*?)[,\.\s]/);
                if (match) {
                  res[prop] = match[1];
                }
                else {
                  throw new Error('Could not link element to interface: ' + getText(dd));
                }
              }
            }
            else {
              throw new Error('Could not link element to interface, missing dd for ' + res.name);
            }
          }
          else if (prop) {
            res[prop] = [];
            let dd = dt.nextElementSibling;
            while (dd && dd.nodeName !== 'DT') {
              if (dd.nodeName === 'DD') {
                res[prop].push(getText(dd).replace(/\.$/, ''));
              }
              dd = dd.nextElementSibling;
            }
          }
        });
        return res;
      });
    })
    .filter(el => !!el)
    .flat();

  if (htmlElements.length) {
    return htmlElements;
  }
  // Extract SVG elements that use the "element-summary" pattern
  const svgSummaryElements = [...document.querySelectorAll('div.element-summary')]
    .map(el => {
      const name = el.querySelector('.element-name');
      if (!name) {
        throw new Error('Could not extract name from element-summary element');
      }
      let dfn = el.querySelector('dfn');
      if (!dfn) {
        // The SVG 1.1 spec does not use dfns, look for an ID on the parent div
        // if defined (happens when there are multiple elements defined in the
        // same section) or at a nearby heading (all other cases).
        dfn = el.parentElement;
        if (!dfn.id) {
          dfn = el.previousElementSibling;
          while (dfn && !dfn.nodeName.match(/^H\d$/)) {
            dfn = dfn.previousElementSibling;
          }
          if (!dfn) {
            throw new Error('Could not locate heading associated with element ' + getText(name));
          }
        }
      }

      const res = {
        name: getText(name).replace(/‘|’/g, ''),
        href: getAbsoluteUrl(dfn)
      };
      const dts = [...el.querySelectorAll('dt')];
      dts.forEach(dt => {
        const prop = ({
          'DOM Interfaces': 'interface'
        })[getText(dt).replace(/:$/, '')];
        
        if (prop === 'interface') {
          let dd = dt.nextElementSibling;
          while (dd && dd.nodeName !== 'DD') {
            dd = dd.nextElementSibling;
          }
          if (dd) {
            // For some reason, the "discard" element has no interface:
            // https://svgwg.org/specs/animations/#DiscardElement
            if (getText(dd)) {
              res[prop] = getText(dd);
            }
          }
          else {
            throw new Error('Could not link element to interface, missing dd for ' + res.name);
          }
        }
      });
      return res;
    });


  // Extract SVG elements that use the "definition-table" pattern
  const svgTableElements = [...document.querySelectorAll('table.definition-table')]
    .map(el => {
      const dfn = el.querySelector('dfn');
      if (!dfn) {
        throw new Error('Could not extract name from definition-table element');
      }

      const res = {
        name: getText(dfn),
        href: getAbsoluteUrl(dfn)
      };
      const ths = [...el.querySelectorAll('th')];
      ths.forEach(th => {
        const prop = ({
          'DOM Interfaces': 'interface'
        })[getText(th).replace(/:$/, '')];
        
        if (prop === 'interface') {
          let td = th.nextElementSibling;
          while (td && td.nodeName !== 'TD') {
            td = td.nextElementSibling;
          }
          if (td) {
            res[prop] = getText(td);
          }
          else {
            throw new Error('Could not link element to interface, missing cell for ' + res.name);
          }
        }
      });
      return res;
    });

  if (svgSummaryElements.length || svgTableElements.length) {
    return svgSummaryElements.concat(svgTableElements);
  }

  // MathML Elements rely on the dfn contract
  // this would work for other specs as well
  const shortname = (typeof spec === 'string') ? spec : spec.shortname;
  const otherElements = [...document.querySelectorAll('dfn[data-dfn-type="element"]')]
    .map(el => {
      const elInfo = {
        name: el.textContent.trim(),
        href: getAbsoluteUrl(el)
      };
      // All elements defined in MathML Core
      // use the MathMLElement interface
      if (shortname === "mathml-core") {
        elInfo.interface = "MathMLElement" ;
      }
      else {
        const interfaces = [...document.querySelectorAll('dfn[data-dfn-type=interface]')]
          .filter(el => el.textContent.trim().toLowerCase() === `html${elInfo.name}element`);
        if (interfaces.length === 1) {
          elInfo.interface = interfaces[0].textContent.trim();
        }
      }
      return elInfo;
      });
  if (otherElements.length) {
    return otherElements;
  }
}
