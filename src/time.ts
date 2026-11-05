// Render the GCS object's `updated` ISO-8601 timestamp in US Eastern as
// "INFERRED 2026-06-01 14:32:18 EDT". The zone abbreviation comes from Intl, so it reads
// EDT from March to November and EST the rest of the year. A hardcoded "EST" was an hour
// off from the time it claimed for most of the year.
export function formatEastern(isoTs: string): string {
  const d = new Date(isoTs)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    // h23, not hour12:false: the latter resolves to h24 in some engines and prints midnight as 24.
    hourCycle: 'h23',
    timeZoneName: 'short',
  }).formatToParts(d)
  const lookup: Record<string, string> = {}
  for (const p of parts) lookup[p.type] = p.value
  return `INFERRED ${lookup.year}-${lookup.month}-${lookup.day} ${lookup.hour}:${lookup.minute}:${lookup.second} ${lookup.timeZoneName}`
}
