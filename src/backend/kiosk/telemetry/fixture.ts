import type { FixtureState } from "./resume-state";
import { saveResumeState } from "./resume-state";
import type { TelemetrySource } from "./source";

export class FixtureSource implements TelemetrySource {
  constructor(
    private readonly filePath: string,
    private readonly resume?: FixtureState,
  ) {}

  async *lines(): AsyncIterable<string> {
    const text = await Bun.file(this.filePath).text();
    const nonEmptyLines = text.split("\n").filter((l) => l.trim());

    const startIndex =
      this.resume?.path === this.filePath && nonEmptyLines.length > this.resume.lineIndex
        ? this.resume.lineIndex
        : 0;

    let seq = this.resume?.seq ?? 0;

    for (let i = startIndex; i < nonEmptyLines.length; i++) {
      const line = nonEmptyLines[i];
      if (line === undefined) continue;
      yield line;

      try {
        const parsed = JSON.parse(line) as { seq?: number };
        if (typeof parsed.seq === "number") seq = parsed.seq;
      } catch {
        // retain previous seq
      }

      await saveResumeState({ kind: "fixture", path: this.filePath, lineIndex: i, seq });
    }
  }

  async stop(): Promise<void> {}
}
