/** Formato de presentación: conserva la precisión de los strings del servidor. */
function grouped(integer: string) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export function formatAnalysisMoney(value: string): string {
  const match = /^(-?)(\d+)\.(\d{2})$/.exec(value);
  if (!match) throw new Error("Importe de análisis inválido");
  return `${match[1]}${grouped(match[2])},${match[3]} ARS`;
}

/** La API entrega cuatro decimales; HALF_UP simétrico sin punto flotante. */
export function formatAnalysisPercent(value: string): string {
  const match = /^(-?)(\d+)\.(\d{4})$/.exec(value);
  if (!match) throw new Error("Porcentaje de análisis inválido");
  let digits = match[2] + match[3].slice(0, 2);
  if (match[3][2] >= "5") {
    const alphabet = "0123456789";
    let carry = true;
    const parts = digits.split("");
    for (let index = parts.length - 1; index >= 0 && carry; index--) {
      const next = alphabet.indexOf(parts[index]) + 1;
      parts[index] = alphabet[next % 10];
      carry = next === 10;
    }
    digits = (carry ? "1" : "") + parts.join("");
  }
  const integer = digits.slice(0, -2).replace(/^0+(?=\d)/, "");
  const fraction = digits.slice(-2);
  return `${match[1] && /[1-9]/.test(digits) ? "-" : ""}${grouped(integer)},${fraction} %`;
}
