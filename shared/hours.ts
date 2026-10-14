const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function matchesDay(daysPart: string, dayIndex: number): boolean {
  return daysPart.split(",").some((part) => {
    const range = part.split("-");
    if (range.length === 1) return DAYS.indexOf(range[0]) === dayIndex;
    const start = DAYS.indexOf(range[0]);
    const end = DAYS.indexOf(range[1]);
    if (start < 0 || end < 0) return false;
    return start <= end
      ? dayIndex >= start && dayIndex <= end
      : dayIndex >= start || dayIndex <= end;
  });
}

function minutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function checkOpenNow(hours: string, now = new Date()): boolean | null {
  if (!hours.trim()) return null;
  if (hours.trim() === "24/7") return true;

  const dayIndex = (now.getDay() + 6) % 7;
  const current = now.getHours() * 60 + now.getMinutes();
  const segments = hours.split(";").map((segment) => segment.trim());
  let parsedSegment = false;

  for (const segment of segments) {
    const match = segment.match(/^([\w,\-]+)\s+(\d+:\d+)-(\d+:\d+)/);
    if (!match) continue;
    parsedSegment = true;
    const [, daysPart, openText, closeText] = match;
    const open = minutes(openText);
    const close = minutes(closeText);

    if (close >= open) {
      if (matchesDay(daysPart, dayIndex) && current >= open && current <= close) return true;
      continue;
    }

    if (matchesDay(daysPart, dayIndex) && current >= open) return true;
    const previousDay = (dayIndex + 6) % 7;
    if (current <= close && matchesDay(daysPart, previousDay)) return true;
  }

  return parsedSegment ? false : null;
}
