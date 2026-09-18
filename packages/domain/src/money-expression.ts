import { rationalMoney } from "./money.js";

export const EXPRESSION_LIMITS = {
  length: 256,
  tokens: 128,
  depth: 16,
  literalDigits: 80,
  intermediateDigits: 1024,
} as const;
type Rational = { n: bigint; d: bigint };
const invalid = () =>
  new Error(
    "Expresión inválida: usá números, +, -, *, / y paréntesis, sin miles",
  );
function rational(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new Error("No se puede dividir por cero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  if (
    n.toString().length > EXPRESSION_LIMITS.intermediateDigits ||
    d.toString().length > EXPRESSION_LIMITS.intermediateDigits
  )
    throw new Error("La expresión supera el límite de precisión intermedia");
  let a = n < 0n ? -n : n;
  let b = d;
  while (b) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return { n: n / a, d: d / a };
}

/** Parser de constantes, sin ejecución de código. Ninguna operación monetaria usa Number. */
export function evaluateMoneyExpression(source: string): {
  input: string;
  value: string;
} {
  if (typeof source !== "string" || source.length > EXPRESSION_LIMITS.length)
    throw new Error("Expresión demasiado larga");
  const input = source.trim();
  const tokens: string[] = [];
  for (let cursor = 0; cursor < input.length;) {
    if (/\s/u.test(input[cursor]!)) {
      cursor++;
      continue;
    }
    const token = /^(?:\d+(?:[.,]\d+)?|[()+*/-])/.exec(
      input.slice(cursor),
    )?.[0];
    if (!token) throw invalid();
    tokens.push(token);
    if (tokens.length > EXPRESSION_LIMITS.tokens)
      throw new Error("Demasiados tokens");
    cursor += token.length;
  }
  let cursor = 0;
  function primary(depth: number): Rational {
    const token = tokens[cursor++];
    if (token === "(") {
      if (depth >= EXPRESSION_LIMITS.depth)
        throw new Error("Demasiados paréntesis anidados");
      const result = sum(depth + 1);
      if (tokens[cursor++] !== ")") throw invalid();
      return result;
    }
    if (!token || !/^\d+(?:[.,]\d+)?$/.test(token)) throw invalid();
    const [integer, fraction = ""] = token.replace(",", ".").split(".");
    if (integer!.length + fraction.length > EXPRESSION_LIMITS.literalDigits)
      throw new Error("Literal demasiado largo");
    return rational(
      BigInt(integer! + fraction),
      10n ** BigInt(fraction.length),
    );
  }
  function unary(depth: number): Rational {
    let sign = 1n;
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      if (tokens[cursor++] === "-") sign = -sign;
    }
    const value = primary(depth);
    return { n: sign * value.n, d: value.d };
  }
  function product(depth: number): Rational {
    let left = unary(depth);
    while (tokens[cursor] === "*" || tokens[cursor] === "/") {
      const operator = tokens[cursor++];
      const right = unary(depth);
      left =
        operator === "*"
          ? rational(left.n * right.n, left.d * right.d)
          : rational(left.n * right.d, left.d * right.n);
    }
    return left;
  }
  function sum(depth: number): Rational {
    let left = product(depth);
    while (tokens[cursor] === "+" || tokens[cursor] === "-") {
      const operator = tokens[cursor++];
      const right = product(depth);
      left = rational(
        left.n * right.d + (operator === "+" ? 1n : -1n) * right.n * left.d,
        left.d * right.d,
      );
    }
    return left;
  }
  const result = sum(0);
  if (cursor !== tokens.length) throw invalid();
  return { input, value: rationalMoney(result.n, result.d) };
}
