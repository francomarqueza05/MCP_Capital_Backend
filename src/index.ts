import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { config } from "./config";
import { caseIds } from "./cases/load";
import { openDb } from "./store/db";
import { SqlStore, useStore } from "./store/store";

const db = await openDb();
useStore(new SqlStore(db));
const app = createApp();

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(
    `Cordada API on http://localhost:${info.port}  (docs /docs, ${caseIds().length} cases, ${db.kind}${config.demo ? ", demo links on" : ""})`,
  );
});

const stop = async () => {
  server.close();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
