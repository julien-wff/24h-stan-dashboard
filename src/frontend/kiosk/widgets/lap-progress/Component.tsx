import { useRaceState } from "@frontend/kiosk/state/store";
import type { RaceState } from "@frontend/kiosk/state/types";
import { sectorBoundaryS } from "../sector/constants";

function formatLapTime(seconds: number | null): string {
  if (seconds === null) return "—:——";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const sInt = Math.floor(s);
  const sFrac = Math.round((s - sInt) * 100);
  return `${m}:${String(sInt).padStart(2, "0")}.${String(sFrac).padStart(2, "0")}`;
}

const MAX_PLAUSIBLE_LAP_SEC = 24 * 3600;

function deriveCurrentLapTime(state: RaceState): number | null {
  if (state.t === null) return null;
  const lapKeys = Object.keys(state.laps).map(Number);
  if (lapKeys.length === 0) return null;
  const lastLap = state.laps[Math.max(...lapKeys)];
  if (!lastLap) return null;
  const tSec = Number(state.t);
  const endedAtSec = Number(lastLap.endedAt) / 1000;
  const current = tSec - endedAtSec;
  return current >= 0 && current < MAX_PLAUSIBLE_LAP_SEC ? current : null;
}

export function LapProgressComponent() {
  const state = useRaceState();
  const s = state.s ?? null;
  const currentLapTime = deriveCurrentLapTime(state);
  const fillPct = s !== null ? s * 100 : 0;

  return (
    <div className="flex h-full w-full items-center gap-5.5 border border-border bg-panel px-6.5 py-2">
      <div className="text-[17px] font-bold tracking-[2.5px] text-text-dim">LAP PROGRESS</div>
      <div className="relative h-4 flex-1 bg-[#1f1f1a]">
        <div
          className="absolute bottom-0 left-0 top-0 bg-yellow"
          style={{ width: `${fillPct}%` }}
        />
        {sectorBoundaryS.map((pos) => (
          <div
            key={pos}
            className="absolute -bottom-0.75 -top-0.75 w-px bg-white/40"
            style={{ left: `${pos * 100}%` }}
          />
        ))}
      </div>
      <div className="font-mono text-2xl font-bold tabular-nums text-text">
        {s !== null ? `${fillPct.toFixed(1)}%` : "0.0%"}
      </div>
      <div className="font-mono text-2xl font-bold tabular-nums text-yellow">
        {formatLapTime(currentLapTime)}
      </div>
    </div>
  );
}
