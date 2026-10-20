# backlog-form

A web form service that lets anyone with the form URL submit issues to Backlog, whether they are teammates or outside the organization, and with or without a Backlog account.

Backlog users sign in with their Backlog account, pick a project and issue type, choose which custom fields to show, and get a public form URL. Submissions become issues, with each answer stored in its custom field. Form fields are **generated from Backlog custom fields**, so changing a field in Backlog updates the form.

See [DESIGN.md](./DESIGN.md) (Japanese) for design details.

## For form creators

1. Open the app and sign in with your Backlog space (e.g. `example.backlog.com`), then allow access on Backlog's consent screen.
2. Choose **新しいフォームを作る**, then a project and an issue type. Each issue type shows how many custom fields it has. If the one you need doesn't exist, use the link to Project settings > Issue types in Backlog, then reload the page.
3. Set a title and an optional description (shown under the title), check the custom fields to show, and save.
4. Copy the public URL (`/f/{id}`) with **コピー** on the form page or in the form list, and hand it out. Use **プレビュー** to see the form as submitters do, even while it's unpublished.

Tips:

- **Use an issue type dedicated to form submissions** (e.g. "Inquiry") so they stay separate from other issues.
- **Required custom fields are always shown**, because Backlog rejects issues without them.
- **Field names and descriptions are shown to anyone who opens the form.** Don't select fields you don't want them to see.
- **Field definitions live in Backlog.** Add fields or change choices under Project settings > Custom fields (linked from the form page); the form picks up changes within about five minutes.
- **Show the form in English** with フォームの言語. It changes the buttons, hints and error messages; the title, description, field names and choices are shown as you wrote them, so write those in English too.
- **Set an assignee** under 課題の初期値 so someone is notified of each submission. Priority, categories and milestones can be preset there too. If Backlog rejects a default (e.g. the assignee left the project), the issue is created without the defaults rather than failing.
- **Let the app write the summary** with 件名を自動で付ける. The form then has no summary field, and issues are titled "{form title}（{date and time sent, JST}）". Useful when submitters wouldn't know what to write.
- **Prefill fields with the URL.** Add query parameters named after the inputs, e.g. `/f/{id}?summary=Bug%20report&cf_10=...`. Custom fields are `cf_{field ID}`; for lists, pass the item ID, and repeat the parameter to check several. Submitters can still change the values.
- **Multiple-choice lists are shown as checkboxes** on the form, since they are easier to use than a multi-select box, especially on phones.
- **Issues are created as the user who made the form.** If you don't want your name on them, sign in with a dedicated account.
- **Revoking access breaks your forms.** If you revoke this app's access in Backlog, your forms stop working until you sign in again.

## For operators

The app runs on Cloudflare Workers in production and on Node.js locally. Both use SQLite: a [Durable Object](https://developers.cloudflare.com/durable-objects/) on Cloudflare, `node:sqlite` locally.

### Requirements

- Node.js 24+
- pnpm
- An OAuth application registered on [Backlog's developer site](https://backlog.com/developer/applications/), with the redirect URI `{APP_URL}/oauth/callback`
- For deploying: a Cloudflare account. The Workers Free plan is enough

### Environment variables

For local development with Node.js, copy the template and fill in the values:

```sh
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | yes | Public URL of this app, e.g. `https://forms.example.com` |
| `APP_SECRET` | yes | 32+ random characters (`openssl rand -base64 32`). Encrypts stored tokens and signs cookies |
| `BACKLOG_CLIENT_ID` / `BACKLOG_CLIENT_SECRET` | yes | From the registered OAuth application |
| `DATABASE_PATH` | no | Node.js only. SQLite file, defaults to `data/backlog-form.db` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | no | Cloudflare Turnstile is enabled only when both are set |
| `PORT` | no | Node.js only. Defaults to `3000` |

Keep `APP_SECRET` stable. Changing it signs everyone out and makes the stored tokens unreadable, so every form stops working until its creator signs in again.

The database holds each creator's OAuth tokens (encrypted) and form settings. Put it on persistent storage and back it up. New columns are added automatically on startup, so an existing database keeps working after an upgrade.

### Run locally

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

To run the Worker itself locally, put the same variables (except `DATABASE_PATH` and `PORT`) in `.dev.vars` and run `pnpm cf:dev`. It serves `http://localhost:8787`; set `APP_URL=http://localhost:8787` there, and register `http://localhost:8787/oauth/callback` as a redirect URI if you want to sign in.

### Deploy to Cloudflare

1. Sign in: `pnpm exec wrangler login`
2. Deploy once to get the URL: `pnpm run deploy`. It prints `https://backlog-form.<your-subdomain>.workers.dev`.
3. Set `APP_URL` in `wrangler.jsonc` (`vars`) to that URL, and register `{APP_URL}/oauth/callback` as the redirect URI of the Backlog OAuth application.
4. Set the secrets. Each command prompts for the value:

   ```sh
   pnpm exec wrangler secret put APP_SECRET
   pnpm exec wrangler secret put BACKLOG_CLIENT_ID
   pnpm exec wrangler secret put BACKLOG_CLIENT_SECRET
   # Optional
   pnpm exec wrangler secret put TURNSTILE_SITE_KEY
   pnpm exec wrangler secret put TURNSTILE_SECRET_KEY
   ```

5. Deploy again: `pnpm run deploy`

After that, GitHub Actions deploys every push to `main` once typecheck and tests pass (`.github/workflows/ci.yml`). Pull requests run only the checks. Add these repository secrets:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | An API token made from the "Edit Cloudflare Workers" template |
| `CLOUDFLARE_ACCOUNT_ID` | The account ID shown by `pnpm exec wrangler whoami` |

The app's own secrets (`APP_SECRET` and the rest) stay in Cloudflare and are kept across deploys, so they are not GitHub secrets.

Data lives in the Durable Object's storage and survives deploys. Don't rename the `BackendObject` class or its binding in `wrangler.jsonc`; that needs a Durable Object migration, and getting it wrong deletes the data.

On the Free plan, the limits that matter are 100,000 requests a day (Workers and Durable Objects each; a page view uses a few Durable Object calls) and 10 ms of CPU per request. Requests over a daily limit fail instead of being billed.

### Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start the Node.js server with file watching |
| `pnpm start` | Start the Node.js server |
| `pnpm cf:dev` | Run the Worker locally with `wrangler dev` |
| `pnpm run deploy` | Deploy to Cloudflare |
| `pnpm typecheck` | Type-check with TypeScript 7 |
| `pnpm test` | Run tests with `node:test` |

There is no build step for Node.js: it strips types and runs the `.ts` files directly. Because of that, TypeScript syntax that emits runtime code (such as `enum`) is not allowed. Wrangler bundles the same files for Cloudflare.

## License

TBD
