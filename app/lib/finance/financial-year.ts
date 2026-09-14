/** Indian financial year helpers (1 Apr → 31 Mar). */

export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-based
  const startYear = month >= 3 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  const startYearShort = String(startYear % 100).padStart(2, "0");
  return `${startYearShort}-${endYearShort}`;
}

export function financialYearBounds(fy: string): { start: Date; end: Date } {
  const [a, b] = fy.split("-").map((p) => Number.parseInt(p, 10));
  const startCentury = a > 50 ? 1900 : 2000;
  const startYear = startCentury + a;
  // handle 99-00 style
  const endYear = b < a ? startYear + 1 : startCentury + b;
  return {
    start: new Date(startYear, 3, 1, 0, 0, 0, 0),
    end: new Date(endYear, 2, 31, 23, 59, 59, 999),
  };
}
