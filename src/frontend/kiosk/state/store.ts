import type { RaceUpdate } from "@shared/wire/race-update";
import { useSyncExternalStore } from "react";
import { reduce } from "./reducer";
import type { RaceState } from "./types";
import { initialRaceState } from "./types";

let state: RaceState = initialRaceState;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): RaceState {
  return state;
}

export function dispatch(update: RaceUpdate): void {
  state = reduce(state, update);
  notify();
}

export function setConnection(status: "connecting" | "open" | "closed"): void {
  state = { ...state, connection: status };
  notify();
}

export function resetState(): void {
  state = initialRaceState;
  notify();
}

export function useRaceState(): RaceState {
  return useSyncExternalStore(subscribe, getSnapshot);
}
