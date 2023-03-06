/**
 * Creates an outline for the DOM subtree rooted at the given sectioning content
 * or sectioning root element.
 *
 * This function implements the "creating an outline" algorithm in HTML:
 * https://html.spec.whatwg.org/multipage/sections.html#outlines
 *
 * As a by-product of generating the outline, the function also generates a
 * mapping between elements and the (conceptual) section that contains them in
 * the outline. To save memory, this mapping is only done for elements that have
 * an ID (or a "name" attribute).
 *
 * Both the outline and the mapping are returned.
 */
export default function (root) {
  const headingContent = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HGROUP'];
  const sectioningContent = ['ARTICLE', 'ASIDE', 'NAV', 'SECTION'];
  const sectioningRoot = ['BLOCKQUOTE', 'BODY', 'DETAILS', 'DIALOG', 'FIELDSET', 'FIGURE', 'TD'];

  // A conceptual section has:
  // - a heading element, which may be the string "__implied" when there is no
  // real heading element
  // - an explicit sectioning content element that gave birth to the section,
  // unless the section was implicitly created through a heading element
  // - a list of nested sections
  // - a list of nested outlines, generated by sectioning root elements that
  // this section may contain
  function createSection() {
    return {
      heading: null,
      root: null,
      subSections: [],
      subRoots: []
    };
  }

  function flattenSections(outline) {
    return outline.concat(outline.flatMap(section =>
      flattenSections(section.subSections)));
  }

  // 1. Let current outline target be null. (It holds the element whose outline
  // is being created.)
  let currentOutlineTarget = null;

  // 2. Let current section be null. (It holds a pointer to a section, so that
  // elements in the DOM can all be associated with a section.)
  let currentSection = null;

  // 3. Create a stack to hold elements, which is used to handle nesting.
  // Initialize this stack to empty.
  let stack = [];

  let nodeToOutline = new Map();
  let nodeToParentSection = new Map();
  let nodeToSection = new Map();

  // Compute the rank of the given node
  function rank(node) {
    switch (node.nodeName) {
      case 'H1': return -1;
      case 'H2': return -2;
      case 'H3': return -3;
      case 'H4': return -4;
      case 'H5': return -5;
      case 'H6': return -6;
      case 'HGROUP': return Math.max(...[...node.childNodes].map(rank));
      default: return -100;
    }
  }

  // Process node when walk enters it
  function enter(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    // If the top of the stack is a heading content element or an element with a
    // hidden attribute, do nothing.
    const topOfStack = (stack.length > 0) ? stack[stack.length - 1] : null;
    if (topOfStack &&
        (headingContent.includes(topOfStack.nodeName) ||
          topOfStack.hasAttribute('hidden'))) {
      return;
    }

    // When entering an element with a hidden attribute, push the element being
    // entered onto the stack (This causes the algorithm to skip that element
    // and any descendants of the element).
    if (node.hasAttribute('hidden')) {
      stack.push(node);
      return;
    }

    // When entering a sectioning content element
    if (sectioningContent.includes(node.nodeName)) {
      // 1. If current outline target is not null, then:
      if (currentOutlineTarget) {
        // 1.1 If the current section has no heading, create an implied heading and
        // let that be the heading for the current section.
        if (!currentSection.heading) {
          currentSection.heading = '__implied';
        }

        // 1.2 Push current outline target onto the stack.
        stack.push(currentOutlineTarget);
      }

      // 2. Let current outline target be the element that is being entered.
      currentOutlineTarget = node;

      // 3. Let current section be a newly created section for the current
      // outline target element.
      currentSection = createSection();
      currentSection.root = currentOutlineTarget;

      // 4. Associate current outline target with current section.
      nodeToSection.set(currentOutlineTarget, currentSection);

      // 5. Let there be a new outline for the new current outline target,
      // initialized with just the new current section as the only section in
      // the outline.
      nodeToOutline.set(currentOutlineTarget, [currentSection]);

      return;
    }

    // When entering a sectioning root element
    if (sectioningRoot.includes(node.nodeName)) {
      // 1. If current outline target is not null, push current outline target
      // onto the stack.
      if (currentOutlineTarget) {
        stack.push(currentOutlineTarget);
      }

      // 2. Let current outline target be the element that is being entered.
      currentOutlineTarget = node;

      // 3. Let current outline target's parent section be current section.
      nodeToParentSection.set(currentOutlineTarget, currentSection);

      // 4. Let current section be a newly created section for the current
      // outline target element.
      currentSection = createSection();
      currentSection.root = currentOutlineTarget;

      // 5. Let there be a new outline for the new current outline target,
      // initialized with just the new current section as the only section in
      // the outline.
      nodeToOutline.set(currentOutlineTarget, [currentSection]);

      return;
    }

    // When entering a heading content element
    if (headingContent.includes(node.nodeName)) {
      const outline = nodeToOutline.get(currentOutlineTarget);
      const lastSection = outline[outline.length - 1];

      // If the current section has no heading, let the element being entered be
      // the heading for the current section.
      if (!currentSection.heading) {
        currentSection.heading = node;
      }

      // Otherwise, if the element being entered has a rank equal to or higher
      // than the heading of the last section of the outline of the current
      // outline target, or if the heading of the last section of the outline of
      // the current outline target is an implied heading, then create a new
      // section and append it to the outline of the current outline target
      // element, so that this new section is the new last section of that
      // outline. Let current section be that new section. Let the element being
      // entered be the new heading for the current section.
      else if ((lastSection.heading === '__implied') ||
          (rank(node) >= rank(lastSection.heading))) {
        currentSection = createSection();
        currentSection.heading = node;
        outline.push(currentSection);
      }

      // Otherwise, run these substeps:
      else {
        // 1. Let candidate section be current section.
        let candidateSection = currentSection;
        while (candidateSection) {
          // 2. Heading loop: If the element being entered has a rank lower than
          // the rank of the heading of the candidate section, then create a new
          // section, and append it to candidate section. (This does not change
          // which section is the last section in the outline.) Let current
          // section be this new section. Let the element being entered be the
          // new heading for the current section. Abort these substeps.
          if (rank(node) < rank(candidateSection.heading)) {
            currentSection = createSection();
            currentSection.heading = node;
            candidateSection.subSections.push(currentSection);
            break;
          }

          // 3. Let new candidate section be the section that contains candidate
          // section in the outline of current outline target.
          const sections = flattenSections(nodeToOutline.get(currentOutlineTarget));
          let newCandidateSection = sections.find(section =>
            section.subSections.includes(candidateSection));

          // 4. Let candidate section be new candidate section.          
          candidateSection = newCandidateSection;

          // 5. Return to the step labeled heading loop.
        }

        // Push the element being entered onto the stack. (This causes the
        // algorithm to skip any descendants of the element.)
        stack.push(node);
        return;
      }
    }
  }

  // Process node when walk exits it
  function exit(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    function innerExit() {
      const topOfStack = (stack.length > 0) ? stack[stack.length - 1] : null;

      // When exiting an element, if that element is the element at the top of
      // the stack, pop that element from the stack.
      if (topOfStack === node) {
        stack.pop();
        return;
      }

      // If the top of the stack is a heading content element or an element with
      // a hidden attribute, do nothing.
      if (topOfStack &&
          (headingContent.includes(topOfStack.nodeName) ||
            topOfStack.hasAttribute('hidden'))) {
        return;
      }

      // When exiting a sectioning content element, if the stack is not empty
      if (sectioningContent.includes(node.nodeName) && (stack.length > 0)) {
        // 1. If the current section has no heading, create an implied heading
        // and let that be the heading for the current section.
        if (!currentSection.heading) {
          currentSection.heading = '__implied';
        }

        // 2. Pop the top element from the stack, and let the current outline
        // target be that element.
        currentOutlineTarget = stack.pop();

        // 3. Let current section be the last section in the outline of the
        // current outline target element.
        let outline = nodeToOutline.get(currentOutlineTarget);
        currentSection = outline[outline.length - 1];

        // 4. Append the outline of the sectioning content element being exited
        // to the current section. (This does not change which section is the
        // last section in the outline)
        currentSection.subSections.push(...nodeToOutline.get(node));

        return;
      }

      // When exiting a sectioning root element, if the stack is not empty
      if (sectioningRoot.includes(node.nodeName) && (stack.length > 0)) {
        // 1. If the current section has no heading, create an implied heading
        // and let that be the heading for the current section.
        if (!currentSection.heading) {
          currentSection.heading = '__implied';
        }

        // 2. Let current section be current outline target's parent section.
        currentSection = nodeToParentSection.get(currentOutlineTarget);

        // A sectioning root generates a separate outline, let's attach it
        // to the main outline
        currentSection.subRoots.push(...nodeToOutline.get(node));

        // 3. Pop the top element from the stack, and let the current outline
        // target be that element.
        currentOutlineTarget = stack.pop();

        return;
      }

      // When exiting a sectioning content element or a sectioning root element
      // (when the stack is empty)
      if (sectioningContent.includes(node.nodeName) ||
          sectioningRoot.includes(node.nodeName)) {
        // If the current section has no heading, create an implied heading and
        // let that be the heading for the current section.
        if (!currentSection.heading) {
          currentSection.heading = '__implied';
        }

        // Skip to the next step in the overall set of steps. (The walk is over)
        return;
      }
    }

    innerExit();

    // In addition, whenever the walk exits a node, after doing the steps above,
    // if the node is not associated with a section yet, associate the node with
    // the section current section.
    // (we will only do that for elements that have an ID or a "name" attribute)
    if ((node.getAttribute('id') || node.getAttribute('name')) &&
        !nodeToSection.has(node)) {
      nodeToSection.set(node, currentSection);
    }
  }

  // Walk the DOM subtree in depth-first order, entering and exiting nodes.
  function walk(root, enter, exit) {
    let node = root;
    start: while (node) {
      enter(node);
      // Note: HGROUP is composed of multiple sub-headings but represents a
      // single heading, skip its children as that would create ghost
      // subsections
      if ((node.nodeName !== 'HGROUP') && node.firstChild) {
        node = node.firstChild;
        continue start;
      }
      while (node) {
        exit(node);
        if (node == root) {
          node = null;
        } else if (node.nextSibling) {
          node = node.nextSibling;
          continue start;
        } else {
          node = node.parentNode;
        }
      }
    }
  }

  // 4. Walk over the DOM in tree order, starting with the sectioning content
  // element or sectioning root element at the root of the subtree for which an
  // outline is to be created, and trigger the first relevant step below for
  // each element as the walk enters and exits it.
  walk(root, enter, exit);

  return {
    outline: nodeToOutline.get(root),
    nodeToSection
  };
}
