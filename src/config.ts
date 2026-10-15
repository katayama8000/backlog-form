export type Config = {
  backlog: { spaceUrl: string; apiKey: string };
  turnstile: { siteKey: string; secretKey: string } | null;
  port: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function loadConfig(): Config {
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  return {
    backlog: {
      spaceUrl: required("BACKLOG_SPACE_URL").replace(/\/+$/, ""),
      apiKey: required("BACKLOG_API_KEY"),
    },
    turnstile: siteKey && secretKey ? { siteKey, secretKey } : null,
    port: Number(process.env.PORT ?? 3000),
  };
}
