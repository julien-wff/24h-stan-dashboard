import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
