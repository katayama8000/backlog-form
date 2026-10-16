# backlog-form

A web form service that lets people without a Backlog account (customers, partners, etc.) submit issues to Backlog.

Backlog users sign in with their Backlog account, pick a project and issue type, choose which custom fields to show, and get a public form URL. Submissions become issues, with each answer stored in its custom field. Form fields are **generated from Backlog custom fields**, so changing a field in Backlog updates the form.

See [DESIGN.md](./DESIGN.md) (Japanese) for design details.

## For form creators

1. Open the app and sign in with your Backlog space (e.g. `example.backlog.com`), then allow access on Backlog's consent screen.
2. Choose **新しいフォームを作る**, then a project and an issue type.
3. Set a title, check the custom fields to show, and save. The form page shows the public URL (`/f/{id}`) to hand out.

Tips:

- **Use an issue type dedicated to external submissions** (e.g. "External inquiry") so they stay separate from internal issues.
- **Required custom fields are always shown**, because Backlog rejects issues without them.
- **Field names and descriptions are shown publicly.** Don't select fields with internal-only wording.
- **Field definitions live in Backlog.** Add fields or change choices in the project settings; the form picks up changes within about five minutes.
- **Issues are created as the user who made the form.** If you don't want your name on them, sign in with a dedicated account.
- **Revoking access breaks your forms.** If you revoke this app's access in Backlog, your forms stop working until you sign in again.

## For operators

### Requirements

- Node.js 26+
- pnpm
- An OAuth application registered on [Backlog's developer site](https://backlog.com/developer/applications/), with the redirect URI `{APP_URL}/oauth/callback`

### Environment variables

Copy the template and fill in the values:

```sh
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | yes | Public URL of this app, e.g. `https://forms.example.com` |
| `APP_SECRET` | yes | 32+ random characters (`openssl rand -base64 32`). Encrypts stored tokens and signs cookies |
| `BACKLOG_CLIENT_ID` / `BACKLOG_CLIENT_SECRET` | yes | From the registered OAuth application |
| `DATABASE_PATH` | no | SQLite file. Defaults to `data/backlog-form.db` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | no | Cloudflare Turnstile is enabled only when both are set |
| `PORT` | no | Defaults to `3000` |

Keep `APP_SECRET` stable. Changing it signs everyone out and makes the stored tokens unreadable, so every form stops working until its creator signs in again.

The database holds each creator's OAuth tokens (encrypted) and form settings. Put it on persistent storage and back it up.

### Run

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

### Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start with file watching |
| `pnpm start` | Start |
| `pnpm typecheck` | Type-check with TypeScript 7 |
| `pnpm test` | Run tests with `node:test` |

There is no build step: Node.js strips types and runs the `.ts` files directly. Because of that, TypeScript syntax that emits runtime code (such as `enum`) is not allowed.

## License

TBD
