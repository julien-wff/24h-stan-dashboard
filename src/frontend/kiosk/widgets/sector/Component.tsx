import { useRaceState } from "@frontend/kiosk/state/store";
import { Panel } from "../host";
import { SECTOR_NAMES } from "./constants";

function formatSectorTime(seconds: number | null): string {
  if (seconds === null) return "—:——";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  const sInt = Math.floor(s);
  const sFrac = Math.round((s - sInt) * 100);
  return `${m}:${String(sInt).padStart(2, "0")}.${String(sFrac).padStart(2, "0")}`;
}

export function SectorComponent() {
  const state = useRaceState();

  return (
    <Panel title="SECTORS">
      {SECTOR_NAMES.map((name, i) => {
        const sectorData = state.sectors[i];
        const last = sectorData?.last ?? null;
        const best = sectorData?.best ?? null;
        const isActive = state.sector === i;
        const isBest = last !== null && best !== null && Math.abs(last - best) < 0.05;

        return (
          <div
            key={name}
            className={`flex items-center gap-3.5 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <div
              className={`h-3.5 w-3.5 rounded-xs ${isActive ? "bg-yellow" : "bg-text-dimmer"}`}
            />
            <div
              className={`flex-1 text-[17px] font-bold ${isActive ? "text-text" : "text-text-dim"}`}
            >
              {name}
            </div>
            <div
              className={`font-mono text-[21px] font-extrabold tabular-nums ${isBest ? "text-purple" : last !== null ? "text-text" : "text-text-dimmer"}`}
            >
              {formatSectorTime(last)}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
