import { type Context, Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { adminRoutes } from "./admin/routes.ts";
import { type BacklogGateway, type OAuthProvider, ReauthRequiredError } from "./backlog/client.ts";
import { createSchemaLoader, type FormSchema, FormUnavailableError } from "./backlog/schema.ts";
import { names, readInput } from "./form/input.ts";
import { renderDone, renderForm, renderMessage } from "./form/render.ts";
import { toIssueParams } from "./form/to-issue.ts";
import { validate } from "./form/validate.ts";
import { renderLanding } from "./admin/render.ts";
import type { FormRecord, Store } from "./store.ts";
import { verifyTurnstile } from "./turnstile.ts";

export type AppDeps = {
  store: Store;
  gateway: BacklogGateway;
  oauth: OAuthProvider;
  turnstile: { siteKey: string; secretKey: string } | null;
  appUrl: string;
  cookieSecret: string;
};

export function createApp(deps: AppDeps) {
  const { store, gateway, turnstile } = deps;
  const schemas = createSchemaLoader(store, gateway);
  const app = new Hono();

  // Rejects cross-site form posts, for both admin pages and public forms.
  app.use(csrf({ origin: deps.appUrl }));

  app.route("/", adminRoutes({ ...deps, schemas }));

  const notFound = renderMessage("Not Found", "フォームが見つかりません");
  const unavailable = renderMessage("ご利用いただけません", "このフォームは現在ご利用いただけません。時間をおいて再度お試しください。");

  // Resolves a public form, or the error page to show instead.
  async function loadForm(
    c: Context,
    fresh = false,
  ): Promise<{ form: FormRecord; schema: FormSchema } | Response> {
    const form = store.getForm(c.req.param("formId") ?? "");
    if (!form || !form.enabled) return c.html(notFound, 404);
    try {
      return { form, schema: await schemas.load(form, { fresh }) };
    } catch (error) {
      if (error instanceof FormUnavailableError || error instanceof ReauthRequiredError) {
        console.warn(error.message);
        return c.html(unavailable, 503);
      }
      throw error;
    }
  }

  app.get("/f/:formId", async (c) => {
    const loaded = await loadForm(c);
    if (loaded instanceof Response) return loaded;
    return c.html(renderForm({ schema: loaded.schema, turnstileSiteKey: turnstile?.siteKey }));
  });

  app.post("/f/:formId", async (c) => {
    // Validate against the latest definition in case Backlog settings changed
    // between rendering and submitting.
    const loaded = await loadForm(c, true);
    if (loaded instanceof Response) return loaded;
    const { form, schema } = loaded;

    const formData = await c.req.formData();
    const input = readInput(formData, schema.fields);
    const view = { schema, input, turnstileSiteKey: turnstile?.siteKey };

    // Bots tend to fill every field; pretend success so they don't retry.
    if (input[names.honeypot] !== "") return c.html(renderDone(schema));

    if (turnstile) {
      const token = formData.get("cf-turnstile-response");
      const passed = await verifyTurnstile(
        turnstile.secretKey,
        typeof token === "string" ? token : "",
        c.req.header("CF-Connecting-IP"),
      );
      if (!passed) {
        return c.html(renderForm({ ...view, errors: { form: "認証に失敗しました。もう一度お試しください。" } }), 400);
      }
    }

    const result = validate(input, schema.fields);
    if (!result.ok) return c.html(renderForm({ ...view, errors: result.errors }), 400);

    try {
      const connection = store.getConnection(form.connectionId);
      if (!connection) throw new FormUnavailableError(`Connection of form ${form.id} is gone`);
      await gateway.forConnection(connection).addIssue(toIssueParams(schema, result.submission));
    } catch (error) {
      console.error("Failed to create issue", error);
      return c.html(
        renderForm({ ...view, errors: { form: "送信に失敗しました。時間をおいて再度お試しください。" } }),
        502,
      );
    }
    return c.html(renderDone(schema));
  });

  app.onError((error, c) => {
    // E.g. the CSRF middleware's 403.
    if (error instanceof HTTPException) return error.getResponse();
    // The signed-in user's Backlog access was revoked or expired.
    if (error instanceof ReauthRequiredError) {
      return c.html(renderLanding("Backlog との連携が切れました。もう一度ログインしてください。"), 401);
    }
    console.error(error);
    return c.html(renderMessage("Error", "エラーが発生しました"), 500);
  });

  return app;
}
