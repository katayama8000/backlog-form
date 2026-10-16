# backlog-form

A web form that lets people without a Backlog account (customers, partners, etc.) submit issues to Backlog.

Form fields are **generated from Backlog custom fields**. Add or change a custom field in Backlog's project settings and the form follows.

See [DESIGN.md](./DESIGN.md) (Japanese) for design details.

## Requirements

- Node.js 26+
- pnpm
- A Backlog API key, ideally for a bot user that will be shown as the issue creator

## Setup

### 1. Prepare Backlog

All configuration lives in Backlog. A name starting with `[form]` marks what the app may expose; the marker is stripped before display.

| What | Mark it | Effect |
|---|---|---|
| Project | `[form] Customer support` | The app only looks at marked, non-archived projects |
| Issue type | `[form] お問い合わせ` | Each marked issue type is one form; the rest of the name becomes its title |
| Custom field | `[form] 会社名` | Only marked fields applied to the issue type appear on the form |

1. Create a project whose name starts with `[form]`, and add the API key's user to it.
2. Create an issue type whose name starts with `[form]`.
3. Create the custom fields you want on the form, prefix their names with `[form]`, and apply them to that issue type.

The form is served at `/f/{projectKey}/{issueTypeId}`, e.g. `/f/SUPPORT/12345`.

Names and descriptions of marked fields are shown publicly. Unmarked fields stay internal, but a **required** custom field must be marked: Backlog would reject every submission otherwise, so the form fails to load instead.

### 2. Environment variables

Copy the template and fill in the values:

```sh
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `BACKLOG_SPACE_URL` | yes | e.g. `https://example.backlog.com` |
| `BACKLOG_API_KEY` | yes | API key of the user shown as the issue creator |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | no | Cloudflare Turnstile is enabled only when both are set |
| `PORT` | no | Defaults to `3000` |

### 3. Run

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000/f/{projectKey}/{issueTypeId}`.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start with file watching |
| `pnpm start` | Start |
| `pnpm typecheck` | Type-check with TypeScript 7 |
| `pnpm test` | Run tests with `node:test` |

There is no build step: Node.js strips types and runs the `.ts` files directly. Because of that, TypeScript syntax that emits runtime code (such as `enum`) is not allowed.

## License

TBD
