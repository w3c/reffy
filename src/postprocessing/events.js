/**
 * Post-processing module that consolidates events extracts into one extract
 * per event.
 */

const { isLatestLevelThatPasses, getInterfaceTreeInfo } = require('../lib/util');

module.exports = {
  dependsOn: ['events'],
  input: 'crawl',
  property: 'events',

  run: async function(crawl, options) {
    // Collect list of mixin interfaces
    const mixins = {};
    const parsedInterfaces = [];
    crawl.results.forEach(s => {
      if (s.idlparsed) {
        if (s.idlparsed.idlNames) {
          Object.values(s.idlparsed.idlNames).forEach(dfn => {
            if (dfn.type === 'interface' && !dfn.partial) {
              parsedInterfaces.push(dfn);
            }
          });
        }
        if (s.idlparsed.idlExtendedNames) {
          Object.keys(s.idlparsed.idlExtendedNames).forEach(n => {
            s.idlparsed.idlExtendedNames[n].forEach(f => {
              if (f.type === 'includes') {
                if (!mixins[f.includes]) mixins[f.includes] = [];
                mixins[f.includes].push(n);
              }
            });
          });
        }
      }
    });

    // Only consider latest spec in a series to avoid fake duplicates
    const results = crawl.results.filter(spec =>
      (spec.seriesComposition !== 'delta' && isLatestLevelThatPasses(spec, crawl.results, s => s.events)) ||
      (spec.seriesComposition === 'delta' && spec.events));

    // Update events in place
    const events = results.map(spec => spec.events.map(e => Object.assign({ spec: spec }, e))).flat();
    for (const event of events) {
      expandMixinTargets(event, mixins);
      setBubblingPerTarget(event, parsedInterfaces);
      cleanTargetInTrees(event, parsedInterfaces);
    }

    // Consolidate events extended in other specs
    const eventsToDrop = events
      .filter(event => event.isExtension)
      .map(event => {
        const err = extendEvent(event, events);
        if (err) {
          console.warn(err);
          return event;
        }
        else {
          return null;
        }
      })
      .filter(event => !!event);

    return events
      .filter(event => !eventsToDrop.includes(event))
      .map(event => {
        delete event.spec;
        return event;
      });
  }
};


function expandMixinTargets(event, mixins) {
  const expandedTargets = event.targets?.map(i => mixins[i] || i)?.flat();
  // This assumes a mixin matches more than one interface
  if (expandedTargets && expandedTargets.length !== event.targets?.length) {
    event.targets = expandedTargets;
    return true;
  }
  return false;
}


function setBubblingPerTarget(event, parsedInterfaces) {
  // if an event targets an interface in a tree
  // but the root of the tree wasn't detected as a target
  // we can assume bubbles is false
  // (ideally, we should check the existence of the event handler on the
  // root interface, but there is no easy way to get a consolidated IDL view
  // of the root at the moment)
  if (!event.targets) return;
  const updatedTargets = [];
  const detected = {};
  const treeInterfaces = [];
  for (let iface of event.targets) {
    const treeInfo = getInterfaceTreeInfo(iface, parsedInterfaces);
    if (!treeInfo) {
      updatedTargets.push({target: iface});
      continue;
    }
    const { tree, depth } = treeInfo;
    if (!detected[tree]) {
      detected[tree] = {root: false, nonroot: false};
    }
    if (depth === 0) {
      // bubbling doesn't matter on the root interface
      updatedTargets.push({target: iface});
      detected[tree].root = true;
    } else {
      treeInterfaces.push(iface);
      detected[tree].nonroot = true;
    }
  }
  // if the event is sent at targets in a tree, but isn't detected
  // on the root target, and no bubbling info is available,
  // assume it doesn't bubble
  if (Object.values(detected).length) {
    if (!event.hasOwnProperty('bubbles') && Object.values(detected).every(x => !x.root && x.nonroot )) {
      event.bubbles = false;
    }
  }
  for (let iface of treeInterfaces) {
    if (event.hasOwnProperty('bubbles')) {
      updatedTargets.push({target: iface, bubbles: event.bubbles});
    }
  }
  event.targets = updatedTargets;
  delete event.bubbles;
}


function cleanTargetInTrees(event, parsedInterfaces) {
  // When several targets are attached to an event that bubbles
  // keep only the "deepest" target
  if (event.bubbles && event.targets?.length > 1) {
    const filteredTargets = deepestInterfaceInTree(event.targets, parsedInterfaces);
    if (filteredTargets.length !== event.targets.length) {
      event.targets = filteredTargets;
      return true;
    }
  }
  return false;
}


function deepestInterfaceInTree(targets, parsedInterfaces) {
  let deepestInTrees = {};
  let filteredTargets = [];
  for (let {target, bubbles} of targets) {
    const treeInfo = getInterfaceTreeInfo(target, parsedInterfaces);
    if (!treeInfo) { // Not in a tree, we keep it in
      filteredTargets.push({target});
      continue;
    }
    const { tree, depth } = treeInfo;
    const currentDeepest = deepestInTrees[tree]?.target;
    if (currentDeepest) {
      const { depth: currentDeepestDepth } = getInterfaceTreeInfo(currentDeepest, parsedInterfaces);
      if (depth > currentDeepestDepth) {
        deepestInTrees[tree] = {target, bubbles};
      }
    } else {
      deepestInTrees[tree] = {target, bubbles};
    }
  }
  return filteredTargets.concat(Object.values(deepestInTrees));
}


function extendEvent(event, events) {
  const extendedEvent =
    events.find(e => !e.isExtension && e.href === event.href) ||
    events.find(e => !e.isExtension && event.href.startsWith(e.spec.crawled) && e.type === event.type);
  if (!extendedEvent) {
    // make this a fatal error
    return `Found extended event with link ${event.href} in ${event.spec.shortname}, but did not find a matching original event`;
  }
  if (extendedEvent.interface && event.interface && extendedEvent.interface !== event.interface) {
    return `Found extended event with link ${event.href} in ${event.spec.shortname} set to use interface ${event.interface}, different from original event interface ${extendedEvent.interface} in ${extendedEvent.spec.shortname}`;
  }
  // Document potential additional targets
  const newTargets = event.targets?.filter(t => !extendedEvent.targets?.find(tt => tt.target === t.target));
  if (newTargets) {
    extendedEvent.targets = (extendedEvent.targets || []).concat(newTargets);
  }
  // Document the fact that the event has been extended
  if (!extendedEvent.extendedIn) {
    extendedEvent.extendedIn = [];
  }
  extendedEvent.extendedIn.push({ spec: event.spec.series.shortname, href: event.src?.href });
}
