import { Error as BacklogErrors } from "backlog-js";
import { type Context, Hono } from "hono";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { adminRoutes } from "./admin/routes.ts";
import { type BacklogGateway, type OAuthProvider, ReauthRequiredError } from "./backlog/client.ts";
import { createSchemaLoader, type FormSchema, FormUnavailableError } from "./backlog/schema.ts";
import { generatedSummary, names, readInput } from "./form/input.ts";
import { MESSAGES } from "./form/messages.ts";
import { renderDone, renderForm, renderMessage } from "./form/render.ts";
import { toIssueParams } from "./form/to-issue.ts";
import { validate } from "./form/validate.ts";
import { renderLanding } from "./admin/render.ts";
import type { Backend } from "./backend.ts";
import { type FormRecord, hasDefaults, NO_DEFAULTS } from "./store.ts";
import { verifyTurnstile } from "./turnstile.ts";

export type AppDeps = {
  store: Backend;
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

  // The form, and so its language, is unknown here.
  const notFound = renderMessage("Not Found", "フォームが見つかりません / Form not found");

  // Resolves a public form, or the error page to show instead.
  async function loadForm(
    c: Context,
    fresh = false,
  ): Promise<{ form: FormRecord; schema: FormSchema } | Response> {
    const form = await store.getForm(c.req.param("formId") ?? "");
    if (!form || !form.enabled) return c.html(notFound, 404);
    try {
      return { form, schema: await schemas.load(form, { fresh }) };
    } catch (error) {
      if (error instanceof FormUnavailableError || error instanceof ReauthRequiredError) {
        console.warn(error.message);
        const t = MESSAGES[form.lang];
        return c.html(renderMessage(t.unavailableTitle, t.unavailable, form.lang), 503);
      }
      throw error;
    }
  }

  app.get("/f/:formId", async (c) => {
    const loaded = await loadForm(c);
    if (loaded instanceof Response) return loaded;
    // Query parameters named like the inputs prefill them, e.g. ?summary=...&cf_10=...
    const input = readInput(new URL(c.req.url).searchParams, loaded.schema.fields);
    return c.html(renderForm({ schema: loaded.schema, input, turnstileSiteKey: turnstile?.siteKey }));
  });

  app.post("/f/:formId", async (c) => {
    // Validate against the latest definition in case Backlog settings changed
    // between rendering and submitting.
    const loaded = await loadForm(c, true);
    if (loaded instanceof Response) return loaded;
    const { form, schema } = loaded;
    const t = MESSAGES[schema.lang];

    const formData = await c.req.formData();
    const input = readInput(formData, schema.fields);
    if (schema.autoSummary) input[names.summary] = generatedSummary(schema.title, new Date(), schema.lang);
    const view = { schema, input, turnstileSiteKey: turnstile?.siteKey };

    // Bots tend to fill every field; pretend success so they don't retry.
    const done = () => c.html(renderDone(schema, `/f/${form.id}`));
    if (input[names.honeypot] !== "") return done();

    if (turnstile) {
      const token = formData.get("cf-turnstile-response");
      const passed = await verifyTurnstile(
        turnstile.secretKey,
        typeof token === "string" ? token : "",
        c.req.header("CF-Connecting-IP"),
      );
      if (!passed) {
        return c.html(renderForm({ ...view, errors: { form: t.turnstileFailed } }), 400);
      }
    }

    const result = validate(input, schema.fields, t.errors);
    if (!result.ok) return c.html(renderForm({ ...view, errors: result.errors }), 400);

    try {
      const connection = await store.getConnection(form.connectionId);
      if (!connection) throw new FormUnavailableError(`Connection of form ${form.id} is gone`);
      const client = gateway.forConnection(connection);
      try {
        await client.addIssue(toIssueParams(schema, result.submission));
      } catch (error) {
        // E.g. the default assignee left the project. Don't lose the submission over it.
        if (!(error instanceof BacklogErrors.BacklogApiError) || !hasDefaults(schema.issueDefaults)) throw error;
        console.warn(`Form ${form.id}: retrying without issue defaults`, error);
        await client.addIssue(toIssueParams(schema, result.submission, NO_DEFAULTS));
      }
    } catch (error) {
      console.error("Failed to create issue", error);
      return c.html(
        renderForm({ ...view, errors: { form: t.submitFailed } }),
        502,
      );
    }
    return done();
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
