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

export type EnvVars = Record<string, unknown>;

// Reads process.env on Node, or the Worker's bindings on Cloudflare.
export function loadConfig(env: EnvVars): Config {
  const optional = (name: string) => (typeof env[name] === "string" ? env[name] : undefined) || undefined;
  const required = (name: string) => {
    const value = optional(name);
    if (!value) throw new Error(`Missing environment variable: ${name}`);
    return value;
  };
  const appSecret = required("APP_SECRET");
  if (appSecret.length < 32) throw new Error("APP_SECRET must be at least 32 characters");
  const siteKey = optional("TURNSTILE_SITE_KEY");
  const secretKey = optional("TURNSTILE_SECRET_KEY");
  return {
    appUrl: new URL(required("APP_URL")).origin,
    appSecret,
    backlog: {
      clientId: required("BACKLOG_CLIENT_ID"),
      clientSecret: required("BACKLOG_CLIENT_SECRET"),
    },
    databasePath: optional("DATABASE_PATH") ?? "data/backlog-form.db",
    turnstile: siteKey && secretKey ? { siteKey, secretKey } : null,
    port: Number(optional("PORT") ?? 3000),
  };
}
