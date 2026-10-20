import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

// Colors follow Backlog's brand green (#42ce9f). Text on green uses a darker
// shade so buttons keep a 4.5:1 contrast ratio.
const styles = raw(`
:root {
  color-scheme: light dark;
  --brand: #42ce9f;
  --brand-strong: #16805e;
  --brand-strong-hover: #116a4e;
  --on-brand: #ffffff;
  --brand-soft: #e6f8f1;
  --bg: #f2f4f3;
  --surface: #ffffff;
  --text: #262b29;
  --muted: #66706c;
  --border: #ccd3d0;
  --danger: #c62d2d;
  --danger-soft: #fdeeee;
}
@media (prefers-color-scheme: dark) {
  :root {
    --brand-strong: #42ce9f;
    --brand-strong-hover: #6adbb5;
    --on-brand: #0b2a1f;
    --brand-soft: #173a2e;
    --bg: #121614;
    --surface: #1c2220;
    --text: #e6ebe9;
    --muted: #9aa6a1;
    --border: #3a4541;
    --danger: #ff7b7b;
    --danger-soft: #3a1f1f;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.7 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif;
}
main { max-width: 680px; margin: 0 auto; padding: 40px 16px 64px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 6px solid var(--brand);
  border-radius: 10px;
  padding: 32px;
}
@media (max-width: 600px) {
  main { padding-top: 16px; }
  .card { padding: 24px 18px; }
}
h1 { font-size: 1.5rem; line-height: 1.4; margin: 0 0 8px; }
.lead { color: var(--muted); font-size: 0.875rem; margin: 0 0 28px; }
.field { margin: 0 0 24px; padding: 0; border: 0; min-width: 0; }
.label, legend {
  display: flex; align-items: center; gap: 8px;
  font-weight: 600; margin: 0 0 6px; padding: 0;
}
.req {
  font-size: 0.6875rem; font-weight: 700; line-height: 1;
  color: var(--on-brand); background: var(--brand-strong);
  border-radius: 4px; padding: 4px 6px;
}
.hint { display: block; color: var(--muted); font-size: 0.8125rem; margin: -2px 0 8px; }
.unit { color: var(--muted); font-size: 0.875rem; margin-left: 8px; }
input[type="text"], input[type="number"], input[type="date"], select, textarea {
  width: 100%;
  font: inherit; color: inherit;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  transition: border-color .15s, box-shadow .15s;
}
input[type="number"] { width: 12rem; max-width: 100%; }
input[type="date"] { width: auto; }
select[multiple] { min-height: 8rem; }
textarea { resize: vertical; }
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 30%, transparent);
}
[aria-invalid="true"] { border-color: var(--danger) !important; }
.choices { display: flex; flex-wrap: wrap; gap: 8px; }
.choice {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 14px; cursor: pointer;
}
.choice:has(input:checked) { border-color: var(--brand); background: var(--brand-soft); }
.choice input { accent-color: var(--brand-strong); margin: 0; width: 1.05em; height: 1.05em; }
.other { margin-top: 10px; }
.error { display: block; color: var(--danger); font-size: 0.8125rem; margin-top: 6px; }
.alert {
  color: var(--danger); background: var(--danger-soft);
  border: 1px solid var(--danger); border-radius: 6px;
  padding: 12px 14px; margin: 0 0 24px;
}
.divider { border: 0; border-top: 1px solid var(--border); margin: 8px 0 24px; }
.hp { position: absolute; left: -9999px; }
.cf-turnstile { margin: 0 0 24px; }
button {
  display: block; width: 100%;
  font: inherit; font-weight: 700;
  color: var(--on-brand); background: var(--brand-strong);
  border: 0; border-radius: 6px;
  padding: 14px; cursor: pointer;
  transition: background .15s;
}
button:hover { background: var(--brand-strong-hover); }
button:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
.done { text-align: center; padding: 16px 0; }
.done-mark {
  display: inline-grid; place-items: center;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--brand-soft); color: var(--brand-strong);
  font-size: 28px; font-weight: 700; margin-bottom: 12px;
}
.done p { color: var(--muted); margin: 0; }

/* Admin pages */
.topbar {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  color: var(--muted); font-size: 0.875rem; margin: 0 0 12px;
}
.topbar form { margin: 0; }
.brand-name { font-weight: 700; color: var(--text); }
.brand-name::before {
  content: ""; display: inline-block; width: 10px; height: 10px; border-radius: 3px;
  background: var(--brand); margin-right: 8px; vertical-align: 1px;
}
button.link {
  display: inline; width: auto; padding: 0; background: none; border: 0;
  color: var(--brand-strong); font-weight: 600; text-decoration: underline;
}
button.link:hover { background: none; color: var(--brand-strong-hover); }
.btn {
  display: block; text-align: center; text-decoration: none;
  font-weight: 700; color: var(--on-brand); background: var(--brand-strong);
  border-radius: 6px; padding: 14px; margin: 0 0 24px;
}
.btn:hover { background: var(--brand-strong-hover); }
.btn-secondary, button.secondary {
  color: var(--text); background: var(--surface); border: 1px solid var(--border);
}
.btn-secondary:hover, button.secondary:hover { background: var(--bg); }
button.danger { color: var(--danger); background: var(--surface); border: 1px solid var(--danger); }
button.danger:hover { background: var(--danger-soft); }
a { color: var(--brand-strong); }
.list { list-style: none; margin: 0 0 24px; padding: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.list > li + li { border-top: 1px solid var(--border); }
.list a.row, .list .row {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 14px 16px; color: inherit; text-decoration: none;
}
/* Highlight the whole row, including buttons next to the link. */
.list > li:has(> a.row:hover, > button:hover) { background: var(--brand-soft); }
.list > li:has(> a.row:hover, > button:hover) .status { background: var(--surface); }
.row-title { font-weight: 600; }
.row-sub { display: block; color: var(--muted); font-size: 0.8125rem; }
.chevron { color: var(--muted); }
.status {
  flex: none; font-size: 0.75rem; font-weight: 700; border-radius: 999px; padding: 3px 10px;
  background: var(--brand-soft); color: var(--brand-strong);
}
.status.off { background: var(--bg); color: var(--muted); }
.steps { display: flex; gap: 6px; flex-wrap: wrap; font-size: 0.8125rem; color: var(--muted); margin: 0 0 8px; padding: 0; list-style: none; }
.steps li + li::before { content: "›"; margin-right: 6px; }
.steps .current { color: var(--brand-strong); font-weight: 700; }
.empty { color: var(--muted); text-align: center; padding: 24px 16px; margin: 0 0 24px; border: 1px dashed var(--border); border-radius: 8px; }
.url-box { display: flex; gap: 8px; margin: 0 0 24px; }
.url-box input { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.875rem; }
.url-box a { flex: none; align-self: center; font-size: 0.875rem; }
.choice-list { display: grid; gap: 8px; }
.choice-list .choice { justify-content: flex-start; }
.choice .meta { color: var(--muted); font-size: 0.8125rem; margin-left: auto; }
.choice:has(input:disabled) { cursor: default; }
.notice { background: var(--brand-soft); border-radius: 6px; padding: 12px 14px; margin: 0 0 24px; font-size: 0.875rem; }
.actions { display: grid; gap: 12px; }
.form-description { white-space: pre-line; margin: 0 0 16px; }
.preview-banner { text-align: center; font-weight: 700; }
button:disabled { opacity: 0.6; cursor: default; }
button.copy {
  display: inline-block; width: auto; flex: none;
  font-size: 0.875rem; padding: 8px 14px;
}
.list .form-row { display: flex; align-items: center; }
.list .form-row > a.row { flex: 1; min-width: 0; }
.list .form-row > button.copy { margin-right: 16px; }
.toast {
  position: fixed; left: 50%; bottom: 24px; z-index: 10;
  max-width: calc(100% - 32px); margin: 0; padding: 12px 20px;
  color: var(--on-brand); background: var(--brand-strong); font-weight: 600;
  border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
  pointer-events: none;
  animation: toast 4s ease forwards;
}
@keyframes toast {
  from { opacity: 0; transform: translate(-50%, 8px); }
  8%, 85% { opacity: 1; transform: translate(-50%, 0); }
  to { opacity: 0; transform: translate(-50%, 0); visibility: hidden; }
}
@media (prefers-reduced-motion: reduce) {
  .toast { animation: none; }
}
`);

// Progressive enhancements shared by every page; everything works without them.
// - Forms with data-once can't be submitted twice (avoids duplicate issues).
// - The first invalid input gets focus after a failed submit.
// - Buttons with data-copy copy that text to the clipboard.
const script = raw(`
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!form.hasAttribute("data-once")) return;
  if (form.dataset.sent) return event.preventDefault();
  form.dataset.sent = "1";
  const button = form.querySelector("button[type=submit]");
  if (button) { button.disabled = true; button.dataset.label = button.textContent; button.textContent = button.dataset.busy || "送信中…"; }
});
// Pages restored from the back/forward cache keep the disabled state.
window.addEventListener("pageshow", () => {
  for (const form of document.querySelectorAll("form[data-sent]")) {
    delete form.dataset.sent;
    const button = form.querySelector("button[type=submit]");
    if (button) { button.disabled = false; button.textContent = button.dataset.label; }
  }
});
document.querySelector("[aria-invalid=true]")?.focus();
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = "コピーしました";
  } catch {
    button.textContent = "コピーできませんでした";
  }
  setTimeout(() => { button.textContent = "コピー"; }, 2000);
});
`);

// `html` escapes every interpolated value, so Backlog-provided labels are safe.
export function layout(title: string, body: Html, head: Html = html``, lang = "ja"): Html {
  return html`<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#42ce9f" />
    <title>${title}</title>
    <style>${styles}</style>
    ${head}
  </head>
  <body>
    <main><div class="card">${body}</div></main>
    <script>${script}</script>
  </body>
</html>`;
}

