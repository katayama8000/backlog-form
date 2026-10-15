const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(
  secretKey: string,
  token: string,
  remoteIp?: string,
): Promise<boolean> {
  if (token === "") return false;
  const body = new URLSearchParams({ secret: secretKey, response: token });
  if (remoteIp) body.set("remoteip", remoteIp);
  const res = await fetch(VERIFY_URL, { method: "POST", body });
  if (!res.ok) return false;
  const result = (await res.json()) as { success: boolean };
  return result.success;
}
