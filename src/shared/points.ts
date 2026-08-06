export function formatPointsValue(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString('de-DE', {
        maximumFractionDigits: 1,
      });
}
