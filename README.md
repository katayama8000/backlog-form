# backlog-form

A web form that lets people without a Backlog account (customers, partners, etc.) submit issues to Backlog.

Form fields are **generated from Backlog custom fields**. Add or change a custom field in Backlog's project settings and the form follows.

See [DESIGN.md](./DESIGN.md) (Japanese) for design details.

## Requirements

- Node.js 24+
- pnpm
- A Backlog API key, ideally for a bot user that will be shown as the issue creator

## Setup

### 1. Prepare Backlog

1. In the target project, create an issue type dedicated to external submissions (e.g. "External inquiry").
2. Create the custom fields you want on the form and apply them to that issue type.

**Every custom field applied to this issue type is shown publicly.** Don't put internal-only wording in field names or descriptions.

### 2. Register the form

Add an entry to `src/forms.ts`:

```ts
{
  slug: "support",        // served at /f/support
  title: "お問い合わせ",
  projectKey: "EXAMPLE",
  issueTypeId: 12345,     // the issue type created in step 1
  priorityId: 3,          // priority for created issues (3 = Normal)
}
```

### 3. Environment variables

Create `.env` in the project root:

```sh
BACKLOG_SPACE_URL=https://example.backlog.com
BACKLOG_API_KEY=xxxxxxxx

# Optional: Cloudflare Turnstile is enabled only when both are set
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# Optional: defaults to 3000
PORT=3000
```

### 4. Run

```sh
pnpm install
pnpm dev
```

Open `http://localhost:3000/f/support`.

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
