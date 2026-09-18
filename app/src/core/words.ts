// Numbers into the words a runner would use, for the ones the app and the mockups both need.

export function compass(degrees: number): string {
  const names = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return names[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16];
}

/**
 * "Sunday 1 November 2026" (or, short, "Sun 1 Nov 2026"), from a bare calendar date. The date is pinned to noon UTC and
 * formatted in UTC, so a browser west of Greenwich can't slide it back to Saturday.
 */
export function raceDate(isoDate: string, names: "long" | "short" = "long"): string {
  const parts = new Intl.DateTimeFormat("en-GB", { weekday: names, day: "numeric", month: names, year: "numeric", timeZone: "UTC" }).formatToParts(
    new Date(`${isoDate}T12:00:00Z`),
  );
  const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("weekday")} ${part("day")} ${part("month")} ${part("year")}`;
}
