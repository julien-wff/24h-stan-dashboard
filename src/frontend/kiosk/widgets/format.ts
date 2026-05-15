export function formatElapsed(seconds: number | null): string {
  if (seconds === null) return "0:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatLapTime(seconds: number | null): string {
  if (seconds === null) return "—:——";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const sInt = Math.floor(s);
  const sFrac = Math.round((s - sInt) * 100);
  return `${m}:${String(sInt).padStart(2, "0")}.${String(sFrac).padStart(2, "0")}`;
}

export function formatDelta(delta: number): string {
  const sign = delta >= 0 ? "+" : "-";
  return `${sign}${Math.abs(delta).toFixed(2)}`;
}
