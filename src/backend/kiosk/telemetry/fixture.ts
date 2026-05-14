import type { TelemetrySource } from "./source";

export class FixtureSource implements TelemetrySource {
  constructor(private readonly filePath: string) {}

  async *lines(): AsyncIterable<string> {
    const text = await Bun.file(this.filePath).text();
    for (const line of text.split("\n")) {
      if (line.trim()) yield line;
    }
  }

  async stop(): Promise<void> {}
}
