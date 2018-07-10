// Based on https://drafts.csswg.org/css-values-4/#value-defs


const primitives = new Map([
  ["custom-ident", {url: "https://drafts.csswg.org/css-values-4/#custom-idents"}],
  ["string", {url: "https://drafts.csswg.org/css-values-4/#strings"}],
  ["url", {url: "https://drafts.csswg.org/css-values-4/#urls"}],
  ["integer", {url: "https://drafts.csswg.org/css-values-4/#integers"}],
  ["number", {url: "https://drafts.csswg.org/css-values-4/#numbers"}],
  ["percentage", {url: "https://drafts.csswg.org/css-values-4/#percentages"}],
  ["length-percentage", {url: "https://drafts.csswg.org/css-values-4/#length-percentage"}],
  ["frequency-percentage", {url: "https://drafts.csswg.org/css-values-4/#frequency-percentage"}],
  ["angle-percentage", {url: "https://drafts.csswg.org/css-values-4/#angle-percentage"}],
  ["time-percentage", {url: "https://drafts.csswg.org/css-values-4/#time-percentage"}],
  ["dimension", {url: "https://drafts.csswg.org/css-values-4/#dimensions"}],
  ["length", {url: "https://drafts.csswg.org/css-values-4/#lengths"}],
  ["angle", {url: "https://drafts.csswg.org/css-values-4/#angles"}],
  ["time", {url: "https://drafts.csswg.org/css-values-4/#time"}],
  ["frequency", {url: "https://drafts.csswg.org/css-values-4/#frequency"}],
  ["resolution", {url: "https://drafts.csswg.org/css-values-4/#frequency"}],
  ["color", {url: "https://drafts.csswg.org/css-color-3/#valuea-def-color"}],
  ["image", {url: "https://drafts.csswg.org/css-images-3/#typedef-image"}],
  ["position", {url: "https://drafts.csswg.org/css-values-4/#typedef-position"}]
]);

const combinatorsMap = [['&&', 'allOf'],
                        ['||', 'anyOf'],
                        ['|', 'oneOf']];

const unquotedTokens = ['/', ',', '(', ')'];

const componentizeByCombinators = (parts, combinators = new Map(combinatorsMap)) => {
  const res = {};
  let combinatorFound = false;
  const combinatorIterator = combinators.entries();
  while (!combinatorFound) {
    const {value: entry, done} = combinatorIterator.next();
    if (done) break;
    const [c,t] = entry;
    if (Array.isArray(parts) && parts.includes(c)) {
      combinatorFound = true;
      // going down into the list of combinators by order of precedence
      const lowerCombinators = new Map(combinators);
      lowerCombinators.delete(c);
      let components = splitByCombinator(parts, c);
      res[t] = components.map(p => componentizeByCombinators(p, lowerCombinators));
    }
  }
  if (!combinatorFound) {
    if (Array.isArray(parts)) {
      if (parts.length > 1) {
        return {type: "array", items: parts.map(p => componentizeByCombinators(p))};
      } else {
        return componentizeByCombinators(parts[0]);
      }
    }
    if (parts && parts.type && parts.type === "array")
      return {...parts, items: componentizeByCombinators(parts.items)};
    return parts;
  }
  return res;
};

const splitByCombinator = (parts, combinator) => {
  const {components} = parts.reduce((a, b, i) => {
    if (b === combinator) {
      a.components.push(a.head.length === 1 ? a.head[0] : a.head);
      a.head = [];
    } else {
      if (Array.isArray(b)) {
        a.head.push(componentizeByCombinators(b));
      } else {
        a.head.push(b);
      }
    }
    if (i === parts.length - 1) {
      a.components.push(a.head.length === 1 ? a.head[0] : a.head);
    }
    return a;
  }, {head: [], components: []});
  return components;
};

const parseMultiplierRange = range => {
  if (range[0] !== '{')
    throw new Error(`Expected { at the start of multiplier range ${range}`);
  if (range[range.length - 1] !== '}')
    throw new Error(`Expected } at the end of multiplier range ${range}`);
  const values = range.slice(1,range.length - 1);
  if (values.match(/^[0-9]+$/)) {
    return {minItems: parseInt(values, 10), maxItems: parseInt(values, 10)};
  } else if (values.match(/^[0-9]+,[0-9]+$/)) {
    const [min,max] = values.split(',');
    return {minItems: parseInt(min, 10), maxItems: parseInt(max, 10)};
  } else {
    throw new Error(`Unrecognized range format in multiplier ${range}`);
  }
};

const parseMultiplier = (multiplier, modifiee) => {
  let ret;
  let multiplierLength = 1;
  if (multiplier === '') {
    return modifiee;
  } else if (multiplier[0] === '*') {
    ret = {
      type: "array",
      items: modifiee
    };
  } else if (multiplier[0] === '+') {
    ret = {
      type: "array",
      items: modifiee,
      minItems: 1
    };
  } else if (multiplier[0] === '#') {
      ret =  {
        type: "array",
        items: modifiee,
        separator: ","
      };
  } else if (multiplier.startsWith('{')) {
    multiplierLength = (multiplier.match(/^(\{[^\}]*\})/)[1] || "{").length;
    ret =  {
      type: "array",
      items: modifiee,
      ...parseMultiplierRange(multiplier)
    };
  } else if (multiplier[0] === '?') {
    if (Array.isArray(modifiee)) {
      ret =  {type: "array", items: modifiee, maxItems: 1};
    } else {
      ret = {...modifiee, optional: true};
    }
  } else if (multiplier[0] === '!') {
    if (Array.isArray(modifiee)) {
      ret =  {type: "array", items: modifiee, minItems: 1};
    } else {
      throw new Error(`Multiplier "!" applied to non-group ${modifiee}`);
    }
  } else {
    throw new Error(`Unrecognized multiplier ${multiplier}`);
  }
  return parseMultiplier(multiplier.slice(multiplierLength), ret);
};

const parseTerminals = s => {
  let m;
  let multiplier = '';
  let modifiee = s;
  if ((m = s.match(/([\+\?\*#\!]+)$/))) {
    multiplier = m[1];
    modifiee = s.slice(0, s.length - m[1].length);
  } else if ((m = s.match(/^(.*)(#?\{.*\})$/))) {
    multiplier = m[2];
    modifiee = m[1];
  }
  if ([...new Map(combinatorsMap).keys()].includes(s) || s === '[' || s.startsWith(']')) {
    return s;
  } else if (unquotedTokens.includes(s)) {
    return {type: "string", content: s};
  } else if ((m = s.match(/^\'([^\']*)\'$/))) {
    return {type: "string", content: m[1]};
  } else if ((m = modifiee.match(/^<\'([^\'>]*)\'>$/))) {
    return parseMultiplier(multiplier, {type: "propertyref", name: m[1]});
  } else if ([...primitives.keys()].map(p => "<" + p + ">").includes(modifiee)) {
    return parseMultiplier(multiplier, {type: "primitive", name: modifiee.slice(1, modifiee.length -1)});
  } else if ((m = modifiee.match(/^<([^>]*)>$/))) {
    return parseMultiplier(multiplier, {type: "valuespace", name: modifiee.slice(1, modifiee.length -1)});
  } else if ((m = modifiee.match(/^[-_a-zA-Z]/))) {
    return parseMultiplier(multiplier, {type: "keyword", name: modifiee});
  } else {
    throw new Error(`Unrecognized token ${s}`);
  }
};

const parsePropDefValue = (value) => {
  value = value.trim();
  // TODO: whitespace normalization?

  // Not sure if combinators are supposed to be white-space separated from their content
  // but forcing it for now
  value = value.replace(/\[/g, '[ ')
    .replace(/\]/g, ' ]')
    .replace(/ #/g, '#')
    .replace(/>\|/g, '> |')
    .replace(/\],/g, '] ,')
    .replace(/\]\?,/g, ']? ,');

  let parts = value.split(' ').filter(x => x)
        .map(parseTerminals);

  // matching bracket-groups
  while(parts.lastIndexOf('[') !== -1) {
    const bracketIdx = parts.lastIndexOf('[');

    // closing bracket may be more than just ']'
    // since it can be accompanied with multipliers
    const matchingBracketIdx = parts.findIndex((p, i) => typeof(p)==="string" && p.startsWith(']') && i > bracketIdx);

    if (matchingBracketIdx <= bracketIdx) {
      throw new Error(`Unexpected closing bracket in ${value}`);
    }
    if (matchingBracketIdx === -1) {
      throw new Error(`Unterminated bracket-group in ${value}`);
    }
    const group = parts.slice(bracketIdx + 1, matchingBracketIdx);
    const multiplier = parts[matchingBracketIdx].slice(1);
    const multipliedGroup = multiplier ? parseMultiplier(multiplier, group) : [ group ] ;
    parts = parts.slice(0, bracketIdx)
      .concat(multipliedGroup)
      .concat(parts.slice(matchingBracketIdx + 1));
  }
  const res = componentizeByCombinators(parts);
  return res.length === 1 ? res[0] : res;
};

module.exports.parsePropDefValue =  parsePropDefValue;
