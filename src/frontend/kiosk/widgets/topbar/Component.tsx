import { useRaceState } from "@frontend/kiosk/state/store";
import { formatElapsed } from "../format";

type ExtendedState = ReturnType<typeof useRaceState> & {
  battery?: number | null;
  signal?: number | null;
  satellites?: number | null;
};

function highestLap(laps: Record<number, unknown>): number {
  const keys = Object.keys(laps).map(Number);
  return keys.length > 0 ? Math.max(...keys) : 0;
}

export function TopbarComponent() {
  const state = useRaceState() as ExtendedState;
  const lap = highestLap(state.laps);
  const lapStr = String(lap).padStart(3, "0");

  const battery = state.battery ?? null;
  const signal = state.signal ?? null;
  const satellites = state.satellites ?? null;
  const connection = state.connection;

  const battPct = battery !== null ? `${Math.round(battery * 100)}%` : "—";
  const sats = satellites !== null ? String(satellites) : "—";
  const sigBars =
    signal !== null
      ? Math.max(1, Math.min(4, Math.ceil(signal * 4)))
      : connection === "open"
        ? 4
        : connection === "connecting"
          ? 2
          : 0;
  const sigColor =
    connection === "open" ? "bg-green" : connection === "connecting" ? "bg-amber" : "bg-red";

  return (
    <div
      className="grid h-full w-full border-b border-border bg-panel"
      style={{ gridTemplateColumns: "520px 1fr 520px" }}
    >
      {/* Left: brand */}
      <div className="flex items-center gap-6 bg-yellow px-9 text-black">
        <div className="flex h-20 w-20 items-center justify-center rounded bg-black font-display text-[34px] font-black italic text-yellow">
          CE
        </div>
        <div>
          <div className="text-[30px] font-extrabold leading-none tracking-tight">
            CESI · ÉCOLE D'INGÉNIEURS
          </div>
          <div className="mt-1.5 text-lg font-bold tracking-[1.5px] opacity-75">RACE DASHBOARD</div>
        </div>
      </div>

      {/* Centre: elapsed */}
      <div className="flex items-center justify-center gap-9">
        <div className="text-[19px] font-bold tracking-[4px] text-text-dim">24H DE STAN · LIVE</div>
        <div className="font-mono text-[76px] font-extrabold tabular-nums leading-none tracking-[-1px]">
          {formatElapsed(state.elapsed)}
        </div>
        <div className="text-[19px] font-extrabold tracking-[4px] text-yellow">· ELAPSED ·</div>
      </div>

      {/* Right: sensor + lap */}
      <div className="flex items-center justify-end gap-7 px-9">
        <div className="text-right">
          <div className="text-xs font-bold tracking-[2px] text-text-dimmer">SENSOR</div>
          <div className="mt-1.5 flex items-center gap-3">
            <span className="font-mono text-[22px] font-bold text-text-dim">{battPct}</span>
            <span className="text-text-dimmer">·</span>
            <span className="font-mono text-[22px] font-bold text-text-dim">{sats}</span>
            <span className="text-text-dimmer">·</span>
            <div className="flex items-end gap-0.75">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`w-1.5 ${i <= sigBars ? sigColor : "bg-text-dimmer/40"}`}
                  style={{ height: 5 + i * 4 }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="h-20 w-px bg-border" />
        <div className="text-right">
          <div className="text-xl font-bold tracking-[3px] text-text-dim">LAP</div>
          <div className="font-mono text-[76px] font-extrabold leading-none tabular-nums text-yellow">
            {lapStr}
          </div>
        </div>
      </div>
    </div>
  );
}
