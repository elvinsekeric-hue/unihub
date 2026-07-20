export function relativeDate(value?: string): string {
  if (!value) return '';
  const target = new Date(value).getTime();
  const diffHours = Math.round((target - Date.now()) / 3_600_000);
  if (diffHours < 0) return 'überfällig';
  if (diffHours < 24) return `in ${Math.max(diffHours, 0)} Stunden`;
  return `in ${Math.ceil(diffHours / 24)} Tagen`;
}
