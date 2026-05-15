const DEFAULT_RACE_START = "2026-05-23T16:00:00+02:00";

export function getRaceStartUnixSec(): number {
  const raw = process.env.RACE_START_AT;
  if (!raw || raw.trim() === "") {
    return new Date(DEFAULT_RACE_START).getTime() / 1000;
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`RACE_START_AT is not a valid timestamp: "${raw}"`);
  }
  return d.getTime() / 1000;
}
