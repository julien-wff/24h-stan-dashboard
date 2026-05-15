import { useRaceState } from "@frontend/kiosk/state/store";
import { Panel } from "../host";

type ExtendedState = ReturnType<typeof useRaceState> & {
  distanceKm?: number | null;
  avgSpeed?: number | null;
  topSpeed?: number | null;
  calories?: number | null;
  pitStops?: number | null;
  pitDuration?: number | null;
};

function fmtDec(v: number | null | undefined, decimals: number): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(decimals);
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return String(Math.round(v));
}

function fmtPitDuration(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—:——";
  const m = Math.floor(v / 60);
  const s = Math.floor(v % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function Row({
  label,
  sub,
  value,
  valueClass,
}: {
  label: string;
  sub?: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-border py-3">
      <div>
        <div className="text-[17px] font-bold tracking-[2px] text-text-dim">{label}</div>
        {sub && <div className="mt-0.5 text-[13px] tracking-[1px] text-text-dimmer">{sub}</div>}
      </div>
      <div
        className={`font-mono text-2xl font-extrabold tabular-nums ${valueClass ?? "text-text"}`}
      >
        {value}
      </div>
    </div>
  );
}

export function StatsComponent() {
  const state = useRaceState() as ExtendedState;

  const pitStops = state.pitStops ?? null;
  const pitDuration = state.pitDuration ?? null;
  const pitValue = pitStops !== null ? `${pitStops} · ${fmtPitDuration(pitDuration)}` : "—";

  return (
    <Panel title="STATS">
      <Row
        label="DISTANCE"
        value={state.distanceKm != null ? `${fmtDec(state.distanceKm, 1)} km` : "—"}
      />
      <Row
        label="AVG SPEED"
        value={state.avgSpeed != null ? `${fmtDec(state.avgSpeed, 1)} km/h` : "—"}
      />
      <Row
        label="TOP SPEED"
        value={state.topSpeed != null ? `${fmtDec(state.topSpeed, 1)} km/h` : "—"}
        valueClass="text-green"
      />
      <Row
        label="CALORIES"
        sub="2 PEDALERS"
        value={state.calories != null ? `${fmtInt(state.calories)} kcal` : "—"}
        valueClass="text-amber"
      />
      <Row label="PIT STOPS" value={pitValue} />
    </Panel>
  );
}
