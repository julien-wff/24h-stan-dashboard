import { loadCenterline } from "../track/centerline";
import { bearingDegrees, pointAtDistance } from "./gpx";
import type { SimulatorState } from "./resume-state";
import { saveResumeState } from "./resume-state";
import type { TelemetrySource } from "./source";

const CRUISE_SPEED_KMH = 15;

export class SimulatorSource implements TelemetrySource {
  private stopped = false;
  private stopResolve: (() => void) | undefined;

  private seq: number;
  private distanceM: number;
  private elapsedSec: number;

  constructor(
    private readonly trackPath: string,
    private readonly intervalMs: number = 1000,
    resume?: SimulatorState,
  ) {
    if (resume?.trackPath === trackPath) {
      this.distanceM = resume.distanceM;
      this.elapsedSec = resume.elapsedSec;
      this.seq = (resume.seq + 1) % 65536;
    } else {
      this.distanceM = 0;
      this.elapsedSec = 0;
      this.seq = 0;
    }
  }

  async *lines(): AsyncIterable<string> {
    const polyline = loadCenterline(this.trackPath);
    const startEpochSeconds = Math.floor(Date.now() / 1000);

    let prevLatLon: { lat: number; lon: number } | undefined;

    while (!this.stopped) {
      const speedKmh = CRUISE_SPEED_KMH + 1.0 * Math.sin(this.elapsedSec / 4);
      const speedMps = speedKmh / 3.6;

      this.distanceM += speedMps * (this.intervalMs / 1000);
      this.elapsedSec += this.intervalMs / 1000;

      const pos = pointAtDistance(polyline, this.distanceM);

      let heading: number;
      if (prevLatLon) {
        heading = bearingDegrees(prevLatLon, pos);
      } else {
        const nextIndex = Math.min(pos.segmentIndex + 1, polyline.points.length - 1);
        const segStart = polyline.points[pos.segmentIndex];
        const segEnd = polyline.points[nextIndex];
        heading = segStart && segEnd ? bearingDegrees(segStart, segEnd) : 0;
      }

      prevLatLon = { lat: pos.lat, lon: pos.lon };

      const line = JSON.stringify({
        seq: this.seq,
        t: startEpochSeconds + Math.floor(this.elapsedSec),
        lat: pos.lat,
        lon: pos.lon,
        speed: speedKmh,
        heading,
        hdop: 1.2,
        sats: 9,
        bat: 85,
        cad: 90,
        fix: 1,
        fix3d: 1,
        reboot: 0,
        rssi: -68,
        snr: 10.5,
      });

      yield line;

      await saveResumeState({
        kind: "simulator",
        trackPath: this.trackPath,
        distanceM: this.distanceM,
        elapsedSec: this.elapsedSec,
        seq: this.seq,
      });

      this.seq = (this.seq + 1) % 65536;

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
