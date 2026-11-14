import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { prisma } from "./db/client.js";
import { PrismaSyncRepository } from "./modules/sync/repository.js";
import { PrismaTeacherRepository } from "./modules/teachers/teacher.repository.js";

const config = loadConfig();
const app = createApp({
  config,
  teachers: new PrismaTeacherRepository(prisma),
  sync: new PrismaSyncRepository(prisma),
  ready: async () => {
    await prisma.$queryRaw`SELECT 1`;
  },
});

const server = app.listen(config.PORT, () => {
  console.log(
    JSON.stringify({
      level: "info",
      event: "server_started",
      port: config.PORT,
    }),
  );
});

async function shutdown(signal: string): Promise<void> {
  console.log(
    JSON.stringify({ level: "info", event: "shutdown_started", signal }),
  );
  server.close(async (error) => {
    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          event: "server_close_failed",
          error_name: error.name,
        }),
      );
      process.exitCode = 1;
    }
    await prisma.$disconnect();
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
