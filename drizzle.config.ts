import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/backend/kiosk/db/schema.ts",
  dbCredentials: {
    url: process.env.KIOSK_DB_PATH ?? "./data/kiosk.db",
  },
});
