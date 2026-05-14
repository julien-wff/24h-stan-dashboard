import type { TelemetrySource } from "./source";

// Place de la Carrière, Nancy, France
const CENTER_LAT = 48.6951;
const CENTER_LON = 6.1819;
const LAT_RADIUS = 0.0003;
const LON_RADIUS = 0.0005;

export class SimulatorSource implements TelemetrySource {
  private stopped = false;
  private stopResolve: (() => void) | undefined;
  private seq = 0;

  constructor(private readonly intervalMs: number = 1000) {}

  async *lines(): AsyncIterable<string> {
    const startEpoch = Math.floor(Date.now() / 1000);
    let step = 0;

    while (!this.stopped) {
      const angle = (2 * Math.PI * step) / 120;
      const lat = CENTER_LAT + LAT_RADIUS * Math.sin(angle);
      const lon = CENTER_LON + LON_RADIUS * Math.cos(angle);
      const speed = 25 + 5 * Math.sin(angle * 3);
      const heading = (((step * 3) % 360) + 360) % 360;

      yield JSON.stringify({
        seq: this.seq,
        t: startEpoch + step,
        lat,
        lon,
        speed,
        heading,
        hdop: 1.2 + 0.1 * Math.sin(angle),
        sats: 9,
        bat: 85,
        cad: 90,
        fix: 1,
        fix3d: 1,
        reboot: 0,
        rssi: -68,
        snr: 10.5,
      });

      this.seq = (this.seq + 1) % 65536;
      step++;

      if (this.intervalMs > 0) {
        await new Promise<void>((resolve) => {
          this.stopResolve = resolve;
          setTimeout(resolve, this.intervalMs);
        });
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.stopResolve?.();
  }
}
