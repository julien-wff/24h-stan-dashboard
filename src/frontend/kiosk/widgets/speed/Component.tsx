import { useRaceState } from "@frontend/kiosk/state/store";
import { Panel } from "../host";

type ExtendedState = ReturnType<typeof useRaceState> & {
  topSpeed?: number | null;
  avgSpeed?: number | null;
};

export function SpeedComponent() {
  const state = useRaceState() as ExtendedState;
  const speed = state.speed;
  const topSpeed = state.topSpeed ?? null;
  const avgSpeed = state.avgSpeed ?? null;

  return (
    <Panel title="SPEED">
      <div className="flex items-baseline gap-2.5">
        <div className="font-mono text-[clamp(72px,9vw,138px)] font-extrabold leading-none tabular-nums tracking-[-5px] text-yellow">
          {speed !== null ? String(Math.round(speed)) : "—"}
        </div>
        <div className="text-[28px] font-bold text-text-dim">km/h</div>
      </div>
      <div className="mt-2.5 flex justify-between font-mono text-[17px] font-semibold text-text-dim">
        <span>TOP {topSpeed !== null ? String(Math.round(topSpeed)) : "—"}</span>
        <span>AVG {avgSpeed !== null ? String(Math.round(avgSpeed)) : "—"}</span>
      </div>
    </Panel>
  );
}
