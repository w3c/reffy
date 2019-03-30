// Based on https://drafts.csswg.org/css-values-4/#value-defs


const primitives = new Map([
  ["ident", {}],
  ["ident-token", {}],
  ["declaration-value", {}],
  // the subset below is only used in selectors / MQ
  // probably ought to be removed
  ["number-token", {}],
  ["hash-token", {}],
  ["any-value", {}],
  ["string-token", {}],
  ["function-token", {}],
  ["dimension-token", {}],
  // ----
  ["zero", {url: ""}],
  ["custom-ident", {url: "https://drafts.csswg.org/css-values-4/#custom-idents"}],
  ["string", {url: "https://drafts.csswg.org/css-values-4/#strings"}],
  ["url", {url: "https://drafts.csswg.org/css-values-4/#urls"}],
  ["integer", {url: "https://drafts.csswg.org/css-values-4/#integers"}],
  ["number", {url: "https://drafts.csswg.org/css-values-4/#numbers"}],
  ["percentage", {url: "https://drafts.csswg.org/css-values-4/#percentages"}],
  ["number-percentage", {url: "https://drafts.csswg.org/css-values-4/#number-percentage"}],
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

const multipliersStarters = ['{', '+', '#', '!', '?', '*'];

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
  } else if (values.match(/^[0-9]+,([0-9]+)?$/)) {
    const [min,max] = values.split(',');
    return { ...{minItems: parseInt(min, 10)}, ...(max ? { maxItems: parseInt(max, 10)} : {})};
  } else {
    throw new Error(`Unrecognized range format in multiplier ${range}`);
  }
};

const applyMultiplier = (multiplier, modifiee) => {
  let ret;
  if (multiplier === '*') {
    return {
      type: "array",
      items: modifiee
    };
  } else if (multiplier === '+') {
    return {
      type: "array",
      items: modifiee,
      minItems: 1
    };
  } else if (multiplier === '#') {
      return  {
        type: "array",
        items: modifiee,
        separator: ","
      };
  } else if (multiplier.startsWith('{')) {
    return  {
      type: "array",
      items: modifiee,
      ...parseMultiplierRange(multiplier)
    };
  } else if (multiplier === '?') {
    if (Array.isArray(modifiee)) {
      return {type: "array", items: modifiee, maxItems: 1};
    } else {
      return {...modifiee, optional: true};
    }
  } else if (multiplier === '!') {
    if (Array.isArray(modifiee)) {
      return  {type: "array", items: modifiee, minItems: 1};
    } else {
      throw new Error(`Multiplier "!" applied to non-group ${modifiee}`);
    }
  } else {
    throw new Error(`Unrecognized multiplier ${multiplier}`);
  }
};

const isMultiplier = s => typeof s === "string" &&  multipliersStarters.map(starter => s.startsWith(starter)).includes(true);

const parseTerminals = s => {
  let m;
  if ([...new Map(combinatorsMap).keys()].includes(s) || s === '[' || s.startsWith(']') || isMultiplier(s)) {
    return s;
  } else if (unquotedTokens.includes(s)) {
    return {type: "string", content: s};
  } else if ((m = s.match(/^\'([^\']*)\'$/))) {
    return {type: "string", content: m[1]};
  } else if ((m = s.match(/^<\'([-_a-zA-Z][^\'>]*)\'>$/))) {
    return {type: "propertyref", name: m[1]};
  } else if ([...primitives.keys()].map(p => "<" + p + ">").includes(s)) {
    return {type: "primitive", name: s.slice(1, s.length -1)};
  } else if ((m = s.match(/^<[-_a-zA-Z]([^>]*)>$/))) {
    return {type: "valuespace", name: s.slice(1, s.length -1)};
  } else if ((m = s.match(/^[-_a-zA-Z][-_a-zA-Z0-9]*$/))) {
    return {type: "keyword", name: s};
  } else if ((m = s.match(/^[-_a-zA-Z][-_a-zA-Z0-9]*\($/))) {
    return {type: "functionstart", name: s};
  } else { // TODO: add support for functional notations https://drafts.csswg.org/css-values-4/#functional-notation even though they're not recognized as top-level items in the grammar
    throw new Error(`Unrecognized token ${s}`);
  }
};

const tokenize = (value) => {
  let i = 0, currentToken='', tokens=[], state = 'new';
  const delimiterStates = ['new', 'keyword', 'pipe'];
  while(i < value.length) {
    const c = value[i];
    if (c.match(/\s/)) {
      if (currentToken) tokens.push(currentToken);
      currentToken = '';
      state = 'new';
    } else if (c === '<') {
      if (delimiterStates.includes(state)) {
        if (currentToken) tokens.push(currentToken);
        currentToken = c;
        state = 'labracket';
      } else if (state === 'quote') {
        currentToken += c;
      } else {
        throw new Error(`Unexpected < in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if (c === ">") {
      if (state === 'quote') {
        currentToken += c;
      } else if (state === 'rabracket' || state === 'labracket') {
        currentToken += c;
        tokens.push(currentToken);
        currentToken = '';
        state = 'new';
      } else {
        throw new Error(`Unexpected > in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if (c === "'") {
      if (state === 'quote') {
        currentToken += c;
        tokens.push(currentToken);
        currentToken = '';
        state = 'new';
      } else if (state === 'labracket') {
        currentToken += c;
        state = 'labracketquote';
      } else if (state === 'labracketquote') {
        currentToken += c;
        state = 'rabracket';
      } else {
        if (currentToken) tokens.push(currentToken);
        currentToken = c;
        state = 'quote';
      }
    } else if (c === "[" || c === "]" || c === "+" || c === "*" || c === "#" || c === "!" || c === '?' || c === '/') {
      if (delimiterStates.includes(state)) {
        if (currentToken) tokens.push(currentToken);
        tokens.push(c);
        currentToken='';
        state = 'new';
      } else if (state === 'quote') {
        currentToken += c;
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if ( c === '{' ) {
      if (state === 'quote') {
        currentToken += c;
      } else if (delimiterStates.includes(state)) {
        if (currentToken) tokens.push(currentToken);
        currentToken = c;
        state = 'curlybracket';
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if ( c === '}' ) {
      if (state === 'quote') {
        currentToken += c;
      } else if (state === 'curlybracket') {
        currentToken += c;
        tokens.push(currentToken);
        currentToken = '';
        state = 'new';
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if ( c === ',') {
      if (delimiterStates.includes(state)) {
        if (currentToken) tokens.push(currentToken);
        tokens.push(c);
        currentToken='';
        state = 'new';
      } else if (state === 'quote' || state === 'curlybracket') {
        currentToken += c;
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if ( c === '(') {
      if (state === 'new' || state === 'pipe') {
        if (currentToken) tokens.push(currentToken);
        tokens.push(c);
        currentToken='';
        state = 'new';
      } else if (state === 'quote' || state === 'labracket' || state === 'labracketquote') {
        currentToken += c;
      } else if (state === 'keyword') {
        currentToken += c;
        tokens.push(currentToken);
        currentToken ='';
        state = 'new';
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if (c === ")") {
      if (delimiterStates.includes(state)) {
        if (currentToken) tokens.push(currentToken);
        tokens.push(c);
        currentToken='';
        state = 'new';
      } else if (state === 'quote' || state === 'labracket' || state === 'labracketquote') {
        currentToken += c;
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if ( c === '&') {
      if (state === 'new' || state === 'keyword') { // 'pipe' can't appear just before ampersand
        if (currentToken) tokens.push(currentToken);
        currentToken=c;
        state = 'ampersand';
      } else if (state === 'quote') {
        currentToken += c;
      } else if (state === 'ampersand') {
        currentToken += c;
        tokens.push(currentToken);
        currentToken='';
        state = 'new';
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else if (c === '|') {
      if (state === 'new' || state === 'keyword') {
        if (currentToken) tokens.push(currentToken);
        currentToken=c;
        state = 'pipe';
      } else if (state === 'quote') {
        currentToken += c;
      } else if (state === 'pipe') {
        currentToken += c;
        tokens.push(currentToken);
        currentToken='';
        state = 'new';
      } else {
        throw new Error(`Unexpected ${c} in ${currentToken} while parsing ${value} in state ${state}`);
      }
    } else {
      if (state === 'pipe') {
        tokens.push(currentToken);
        currentToken = 'c';
        state = 'keyword';
      }  else {
        currentToken += c;
        if (state === 'new') state = 'keyword';
      }
    }
    i++;
  }
  if (state === 'new' || state === 'keyword') {
    if (currentToken) tokens.push(currentToken);
  } else {
    throw new Error(`Unexpected EOF while parsing ${value} in state ${state}`);
  }
  return tokens;
};

const parsePropDefValue = (value) => {
  value = value.trim();
  const tokens = tokenize(value);
  let parts = tokens.filter(x => x)
        .map(parseTerminals);

  // Applying multipliers on terminals
  parts = parts.reduce((arr, item, i) => {
    if (!isMultiplier(item)) {
      arr.push(item);
      return arr;
    }
    if (i === 0)
      throw new Error(`Unexpected multiplier ${item} at the start of ${value}`);
    const prevItem = arr.pop();
    if (prevItem !== ']') {
      arr.push(applyMultiplier(item, prevItem));
    } else {
      arr.push(prevItem);
      arr.push(item);
    }
    return arr;
  }, []);

  // matching functional notations
  while(parts.findIndex(p => p.type === 'functionstart') !== -1) {
    const funcIdx = parts.findIndex(p => p.type === 'functionstart');
    const matchingClosingFuncIdx = parts.findIndex((p, i) => p.content === ')' && i > funcIdx);
    if (matchingClosingFuncIdx === -1) {
      throw new Error(`Unterminated function notation in ${value}`);
    }
    const name = parts[funcIdx].name;
    const func = { type: "function",
                   name: name.slice(0, name.length - 1),
                   arguments: parts.slice(funcIdx + 1, matchingClosingFuncIdx)
                 };
    parts = parts.slice(0, funcIdx)
      .concat([func])
      .concat(parts.slice(matchingClosingFuncIdx + 1));
  }

  // matching potentially nested bracket-groups
  while(parts.lastIndexOf('[') !== -1) {
    const bracketIdx = parts.lastIndexOf('[');

    // closing bracket may be more than just ']'
    // since it can be accompanied with multipliers
    const matchingBracketIdx = parts.findIndex((p, i) => p === ']' && i > bracketIdx);

    if (matchingBracketIdx === -1) {
      throw new Error(`Unterminated bracket-group in ${value}`);
    }
    let group = parts.slice(bracketIdx + 1, matchingBracketIdx);
    let multiplier, i = 0, multiplied = false;
    while ((multiplier = parts.slice(matchingBracketIdx + 1)[i]) && isMultiplier(multiplier)) {
      group = applyMultiplier(multiplier, group);
      multiplied = true;
      i++;
    }
    const multipliedGroup = multiplied ? group : [ group ] ;
    parts = parts.slice(0, bracketIdx)
      .concat(multipliedGroup)
      .concat(parts.slice(matchingBracketIdx + 1 + i));
  }
  const res = componentizeByCombinators(parts);
  return res.length === 1 ? res[0] : res;
};

module.exports.parsePropDefValue =  parsePropDefValue;
