export function fmtINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function savingsPct(marketPrice: number, memberPrice: number): number {
  if (marketPrice <= 0 || memberPrice >= marketPrice) {
    return 0;
  }

  return Math.round(((marketPrice - memberPrice) / marketPrice) * 100);
}
