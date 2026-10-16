export type Config = {
  // Public origin of this app, e.g. https://forms.example.com. The OAuth
  // redirect URI is `${appUrl}/oauth/callback`.
  appUrl: string;
  appSecret: string;
  backlog: { clientId: string; clientSecret: string };
  databasePath: string;
  turnstile: { siteKey: string; secretKey: string } | null;
  port: number;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export function loadConfig(): Config {
  const appSecret = required("APP_SECRET");
  if (appSecret.length < 32) throw new Error("APP_SECRET must be at least 32 characters");
  const siteKey = process.env.TURNSTILE_SITE_KEY;
  const secretKey = process.env.TURNSTILE_SECRET_KEY;
  return {
    appUrl: new URL(required("APP_URL")).origin,
    appSecret,
    backlog: {
      clientId: required("BACKLOG_CLIENT_ID"),
      clientSecret: required("BACKLOG_CLIENT_SECRET"),
    },
    databasePath: process.env.DATABASE_PATH || "data/backlog-form.db",
    turnstile: siteKey && secretKey ? { siteKey, secretKey } : null,
    port: Number(process.env.PORT ?? 3000),
  };
}
