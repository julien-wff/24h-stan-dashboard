import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const laps = sqliteTable("laps", {
  lap: integer("lap").primaryKey(),
  startedAt: integer("started_at").notNull(),
  endedAt: integer("ended_at").notNull(),
  timeSec: real("time_sec").notNull(),
  sector1Sec: real("sector1_sec").notNull(),
  sector2Sec: real("sector2_sec").notNull(),
  sector3Sec: real("sector3_sec").notNull(),
  sector4Sec: real("sector4_sec").notNull(),
});

export const rawPackets = sqliteTable("raw_packets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seq: integer("seq").notNull(),
  receivedAt: integer("received_at").notNull(),
  payload: text("payload").notNull(),
});

export const decodedSamples = sqliteTable(
  "decoded_samples",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    rawPacketId: integer("raw_packet_id")
      .notNull()
      .references(() => rawPackets.id),
    seq: integer("seq").notNull(),
    t: integer("t").notNull(),
    lat: real("lat").notNull(),
    lon: real("lon").notNull(),
    speed: real("speed").notNull(),
    heading: real("heading").notNull(),
    hdop: real("hdop").notNull(),
    sats: integer("sats").notNull(),
    bat: integer("bat"),
    cad: integer("cad"),
    fix: integer("fix").notNull(),
    fix3d: integer("fix3d").notNull(),
    reboot: integer("reboot").notNull(),
    rssi: integer("rssi").notNull(),
    snr: real("snr").notNull(),
  },
  (table) => [
    index("decoded_samples_seq_idx").on(table.seq),
    index("decoded_samples_t_idx").on(table.t),
  ],
);
