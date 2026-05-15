import { raceUpdateSchema } from "@shared/wire/race-update";
import { dispatch, resetState, setConnection } from "./state/store";

export function connect(): () => void {
  let n = 0;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  function openSocket() {
    if (disposed) return;

    resetState();
    setConnection("connecting");

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${proto}//${window.location.host}/events`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      n = 0;
      setConnection("open");
    };

    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data as string);
      } catch (err) {
        console.error("[ws-client] JSON parse error:", err);
        return;
      }
      const result = raceUpdateSchema.safeParse(parsed);
      if (!result.success) {
        console.error("[ws-client] Invalid RaceUpdate:", result.error);
        return;
      }
      dispatch(result.data);
    };

    ws.onclose = () => {
      if (disposed) return;
      setConnection("closed");
      n++;
      const delay = Math.min(1000 * 2 ** (n - 1), 30000);
      reconnectTimer = setTimeout(openSocket, delay);
    };

    ws.onerror = () => {
      if (disposed) return;
      setConnection("closed");
      n++;
      const delay = Math.min(1000 * 2 ** (n - 1), 30000);
      reconnectTimer = setTimeout(openSocket, delay);
    };
  }

  openSocket();

  return () => {
    disposed = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws !== null) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.close();
      ws = null;
    }
  };
}
