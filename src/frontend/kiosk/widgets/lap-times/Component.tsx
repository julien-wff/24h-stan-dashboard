import { useRaceState } from "@frontend/kiosk/state/store";
import type { Lap } from "@frontend/kiosk/state/types";
import { Panel } from "../host";

function formatLapTime(seconds: number | null): string {
  if (seconds === null) return "—:——";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const sInt = Math.floor(s);
  const sFrac = Math.round((s - sInt) * 100);
  return `${m}:${String(sInt).padStart(2, "0")}.${String(sFrac).padStart(2, "0")}`;
}

function highestLap(laps: Record<number, Lap>): number {
  const keys = Object.keys(laps).map(Number);
  return keys.length > 0 ? Math.max(...keys) : 0;
}

export function LapTimesComponent() {
  const state = useRaceState();
  const lapNum = highestLap(state.laps);
  const bestLap = state.bestLap;
  const recentLaps = state.recentLaps;

  const lastLap = lapNum > 0 && state.laps[lapNum] ? state.laps[lapNum] : null;

  const delta = lastLap && bestLap ? lastLap.timeSec - bestLap.timeSec : null;

  return (
    <Panel title="LAP TIMES" right={<span className="text-yellow">{`L${lapNum}`}</span>}>
      {/* Summary */}
      <div className="grid grid-cols-2 border-b border-border">
        <div className="border-r border-border p-[14px_18px]">
          <div className="text-sm font-bold tracking-[2.5px] text-text-dim">BEST LAP</div>
          <div className="mt-1 font-mono text-[36px] font-extrabold leading-[1.05] tabular-nums tracking-[-1px] text-purple">
            {formatLapTime(bestLap?.timeSec ?? null)}
          </div>
          {bestLap && (
            <div className="mt-0.5 text-[13px] font-semibold tracking-[1px] text-text-dim">
              LAP {bestLap.lap}
            </div>
          )}
        </div>
        <div className="p-[14px_18px]">
          <div className="text-sm font-bold tracking-[2.5px] text-text-dim">LAST LAP</div>
          <div className="mt-1 font-mono text-[36px] font-extrabold leading-[1.05] tabular-nums tracking-[-1px] text-yellow">
            {formatLapTime(lastLap?.timeSec ?? null)}
          </div>
          {delta !== null && (
            <div className="mt-0.5 text-[13px] font-semibold tracking-[1px] text-text-dim">
              Δ {delta >= 0 ? "+" : ""}
              {delta.toFixed(2)}
            </div>
          )}
        </div>
      </div>

      {/* Recent laps list */}
      <div className="flex-1 overflow-hidden p-[4px_18px_8px]">
        {[...recentLaps]
          .reverse()
          .slice(0, 8)
          .map((lap, i) => {
            const isBest = bestLap !== null && Math.abs(lap.timeSec - bestLap.timeSec) < 0.05;
            const lapDelta = bestLap ? lap.timeSec - bestLap.timeSec : null;
            const isNearBest =
              !isBest && bestLap !== null && lapDelta !== null && lapDelta < bestLap.timeSec * 0.05;

            return (
              <div
                key={lap.lap}
                className={`grid items-center gap-2.5 py-2 ${i > 0 ? "border-t border-border" : ""}`}
                style={{ gridTemplateColumns: "54px 1fr 86px" }}
              >
                <span className="font-mono text-[15px] font-bold text-text-dim">L{lap.lap}</span>
                <span
                  className={`font-mono text-[19px] font-extrabold tabular-nums ${isBest ? "text-purple" : "text-text"}`}
                >
                  {formatLapTime(lap.timeSec)}
                </span>
                <span
                  className={`text-right font-mono text-[14px] font-bold ${isBest ? "text-purple" : isNearBest ? "text-green" : "text-text-dim"}`}
                >
                  {isBest ? "BEST" : lapDelta !== null ? `+${lapDelta.toFixed(2)}` : "—"}
                </span>
              </div>
            );
          })}
      </div>
    </Panel>
  );
}
