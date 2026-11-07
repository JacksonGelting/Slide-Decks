// Small, safe math-expression language for charts and derived variables.
// Never uses eval(). Keep the grammar and function list in sync with
// app/validate.py (parse_expression) and docs/AUTHORING.md.
//
//   numbers      2, 0.5, 1e-3
//   names        deck variables, the chart's x variable, pi, e
//   operators    + - * / ^ (power, right-associative), unary -, parentheses
//   functions    see FUNCTIONS below, e.g. sqrt(x), max(a, b)
//
// -x^2 means -(x^2). Multiplication is always written: 2*x, not 2x.

export const FUNCTIONS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  exp: Math.exp, ln: Math.log, log: Math.log, log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign,
  floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max, pow: Math.pow, hypot: Math.hypot,
};

export const CONSTANTS = { pi: Math.PI, e: Math.E };

export class ExprError extends Error {}

function tokenize(src) {
  const tokens = [];
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\*\*|[-+*/^(),]))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new ExprError(`Unexpected character "${src.slice(i).trim()[0]}" in "${src}".`);
    if (m[1] !== undefined) tokens.push({ k: "num", v: Number(m[1]) });
    else if (m[2] !== undefined) tokens.push({ k: "name", v: m[2] });
    else tokens.push({ k: "op", v: m[3] === "**" ? "^" : m[3] });
    i = re.lastIndex;
  }
  return tokens;
}

/**
 * Parse an expression into a tree. Throws ExprError with a readable message.
 * Tree nodes: {n:"num",v} {n:"var",name} {n:"neg",a} {n:"bin",op,a,b} {n:"call",fn,args}
 */
export function parseExpression(src) {
  const tokens = tokenize(String(src));
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek()?.k === "op" && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}" in "${src}".`);
    pos++;
  };

  function sum() {
    let a = product();
    while (isOp("+") || isOp("-")) { const op = tokens[pos++].v; a = { n: "bin", op, a, b: product() }; }
    return a;
  }
  function product() {
    let a = unary();
    while (isOp("*") || isOp("/")) { const op = tokens[pos++].v; a = { n: "bin", op, a, b: unary() }; }
    return a;
  }
  function unary() {
    if (isOp("-")) { pos++; return { n: "neg", a: unary() }; }
    if (isOp("+")) { pos++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp("^")) { pos++; return { n: "bin", op: "^", a: base, b: unary() }; }
    return base;
  }
  function atom() {
    const tok = peek();
    if (!tok) throw new ExprError(`"${src}" ends too early.`);
    if (tok.k === "num") { pos++; return { n: "num", v: tok.v }; }
    if (tok.k === "name") {
      pos++;
      if (isOp("(")) {
        if (!(tok.v in FUNCTIONS)) throw new ExprError(`Unknown function "${tok.v}" in "${src}".`);
        pos++;
        const args = [];
        if (!isOp(")")) {
          args.push(sum());
          while (isOp(",")) { pos++; args.push(sum()); }
        }
        expect(")");
        return { n: "call", fn: tok.v, args };
      }
      return { n: "var", name: tok.v };
    }
    if (isOp("(")) { pos++; const inner = sum(); expect(")"); return inner; }
    throw new ExprError(`Unexpected "${tok.v}" in "${src}".`);
  }

  if (!tokens.length) throw new ExprError("The expression is empty.");
  const tree = sum();
  if (pos < tokens.length) {
    const tok = tokens[pos];
    const hint = tok.k !== "op" || tok.v === "(" ? " Write multiplication with *, e.g. 2*x." : "";
    throw new ExprError(`Unexpected "${tok.v}" in "${src}".${hint}`);
  }
  return tree;
}

/** Names (variables) an expression reads, excluding constants and functions. */
export function namesIn(tree, out = new Set()) {
  switch (tree.n) {
    case "var": if (!(tree.name in CONSTANTS)) out.add(tree.name); break;
    case "neg": namesIn(tree.a, out); break;
    case "bin": namesIn(tree.a, out); namesIn(tree.b, out); break;
    case "call": tree.args.forEach((a) => namesIn(a, out)); break;
    default: break;
  }
  return out;
}

/** Turn a tree into a fast function of an environment object {name: number}. */
export function compile(tree) {
  switch (tree.n) {
    case "num": { const v = tree.v; return () => v; }
    case "var": {
      const name = tree.name;
      if (name in CONSTANTS) { const v = CONSTANTS[name]; return () => v; }
      return (env) => {
        const v = env[name];
        if (v === undefined) throw new ExprError(`"${name}" is not defined.`);
        return v;
      };
    }
    case "neg": { const a = compile(tree.a); return (env) => -a(env); }
    case "bin": {
      const a = compile(tree.a);
      const b = compile(tree.b);
      switch (tree.op) {
        case "+": return (env) => a(env) + b(env);
        case "-": return (env) => a(env) - b(env);
        case "*": return (env) => a(env) * b(env);
        case "/": return (env) => a(env) / b(env);
        default: return (env) => Math.pow(a(env), b(env));
      }
    }
    case "call": {
      const fn = FUNCTIONS[tree.fn];
      const args = tree.args.map(compile);
      return (env) => fn(...args.map((f) => f(env)));
    }
    default: throw new ExprError("Bad expression tree.");
  }
}
