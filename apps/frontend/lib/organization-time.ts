export function getOrganizationDateKey(value: Date, timeZone?: string | null) {
  if (!timeZone) return value.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';

  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function getOrganizationMonth(value: Date, timeZone?: string | null) {
  return getOrganizationDateKey(value, timeZone).slice(0, 7);
}
