import { stockError } from "../stocks/access.js";
// One unit is 1/10000 of a currency unit. Never pass through a JS float.
export const zero = 0n;
export function units(value: { toString(): string } | string): bigint {
  const text = value.toString();
  if (!/^-?\d{1,15}(\.\d{1,4})?$/.test(text))
    throw stockError("MONEY_INVALID", "Montant d�cimal exact attendu.", 400);
  const negative = text.startsWith("-"),
    [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  return (
    (BigInt(whole!) * 10000n + BigInt(fraction.padEnd(4, "0"))) *
    (negative ? -1n : 1n)
  );
}
export function amount(value: bigint): string {
  const abs = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${abs / 10000n}.${(abs % 10000n).toString().padStart(4, "0")}`;
}
export const positive = (x: bigint) => (x > 0n ? x : 0n);
export const sum = (values: bigint[]) => values.reduce((a, b) => a + b, zero);
export function bounded(value: bigint) {
  if (value < 0n || value > 9999999999999999999n)
    throw stockError(
      "MONEY_RANGE",
      "Montant hors des limites autoris�es.",
      400,
    );
  return amount(value);
}
