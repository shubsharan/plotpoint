import { createPostgresPool, migrateAuthoritativeHunt } from "@plotpoint/db";
import { loadApiConfig } from "./config.js";
import { SharedSessionService } from "./shared-session-service.js";
import { createApiServer } from "./server.js";

export { loadApiConfig } from "./config.js";
export { SharedSessionService, SharedSessionServiceError } from "./shared-session-service.js";
export { createApiServer } from "./server.js";
export { SharedSessionOperatorClient } from "./operator-client.js";

export async function startApi(): Promise<void> {
  const config = loadApiConfig();
  const pool = createPostgresPool({ connectionString: config.databaseUrl });
  await migrateAuthoritativeHunt(pool);
  const server = createApiServer(new SharedSessionService(pool, config.credentialPepper), config);
  server.listen(config.port, "0.0.0.0");
  const shutdown = () => {
    server.close(() => void pool.end());
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  await startApi();
}
