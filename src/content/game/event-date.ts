// The event history names times only as German text relative to today (seen 2026-10-20):
// "heute um 16:23 Uhr", "gestern um 22:48", "Samstag um 20:25". The list reaches back about a week.
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const PATTERN = /^(heute|gestern|[A-Za-z]+) um (\d{1,2}):(\d{2})( Uhr)?$/;

/** Local time of an event date, relative to `now`; a weekday is its most recent past day, never today. */
export function parseEventDate(text: string, now: number): number | undefined {
  const match = PATTERN.exec(text.trim());
  if (!match) return undefined;
  const [, day = '', hours, minutes] = match;
  const h = Number(hours);
  const m = Number(minutes);
  if (h > 23 || m > 59) return undefined;
  const today = new Date(now);
  let back: number;
  if (day === 'heute') back = 0;
  else if (day === 'gestern') back = 1;
  else {
    const weekday = WEEKDAYS.indexOf(day);
    if (weekday < 0) return undefined;
    back = (today.getDay() - weekday + 7) % 7 || 7;
  }
  return new Date(today.getFullYear(), today.getMonth(), today.getDate() - back, h, m).getTime();
}
