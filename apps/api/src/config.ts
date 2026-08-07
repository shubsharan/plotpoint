export interface ApiConfig {
  readonly databaseUrl: string;
  readonly credentialPepper: string;
  readonly operatorToken: string;
  readonly publicOrigin: string;
  readonly port: number;
}

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const databaseUrl = environment.PLOTPOINT_DATABASE_URL;
  const credentialPepper = environment.PLOTPOINT_CREDENTIAL_PEPPER;
  const operatorToken = environment.PLOTPOINT_OPERATOR_TOKEN;
  const publicOrigin = environment.PLOTPOINT_PUBLIC_ORIGIN;
  const port = Number(environment.PLOTPOINT_PORT ?? 4400);
  if (
    !databaseUrl ||
    !credentialPepper ||
    !operatorToken ||
    !publicOrigin ||
    !Number.isSafeInteger(port) ||
    port <= 0 ||
    port > 65_535
  ) {
    throw new Error("api-config-invalid");
  }
  const origin = new URL(publicOrigin);
  if (
    origin.protocol !== "https:" &&
    origin.hostname !== "127.0.0.1" &&
    origin.hostname !== "localhost"
  ) {
    throw new Error("api-public-origin-insecure");
  }
  return Object.freeze({
    databaseUrl,
    credentialPepper,
    operatorToken,
    publicOrigin: origin.origin,
    port,
  });
}
