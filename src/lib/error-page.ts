/**
 * Self-contained HTML error page served by the Worker wrapper
 * (src/server.ts) when SSR fails catastrophically — module-init throws,
 * h3-swallowed 500s, or any uncaught failure inside the request.
 *
 * MUST stay dependency-free. The whole point of this fallback is that it
 * still renders when the rest of the app cannot. No React, no imports
 * from src/*, no remote fonts, no external assets — inline everything.
 *
 * Styling intentionally mirrors the site shell (slate-950 background,
 * emerald accent) so a user landing here knows they're still on Pro
 * Health Peptides, not a generic Cloudflare error.
 */
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Something went wrong | PH Labs</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <meta name="theme-color" content="#020617" />
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        font: 16px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif;
        background: #020617;
        color: #f1f5f9;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 1.5rem;
      }
      .card {
        max-width: 32rem;
        width: 100%;
        background: #0f172a;
        border: 1px solid #1e293b;
        border-radius: 0.75rem;
        padding: 2.5rem 2rem;
        text-align: center;
        box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.5);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.375rem 0.75rem;
        border-radius: 9999px;
        background: rgba(16, 185, 129, 0.12);
        color: #10b981;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        margin-bottom: 1.25rem;
      }
      .badge::before {
        content: "";
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 9999px;
        background: #10b981;
      }
      h1 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0 0 0.75rem;
        color: #ffffff;
      }
      p {
        color: #cbd5e1;
        margin: 0 0 1.75rem;
      }
      .actions {
        display: flex;
        gap: 0.625rem;
        justify-content: center;
        flex-wrap: wrap;
      }
      .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 44px;
        padding: 0.625rem 1.25rem;
        border-radius: 0.5rem;
        font: inherit;
        font-weight: 500;
        text-decoration: none;
        cursor: pointer;
        border: 1px solid transparent;
        transition: background-color 0.15s ease, border-color 0.15s ease;
      }
      .btn-primary {
        background: #10b981;
        color: #022c22;
      }
      .btn-primary:hover { background: #34d399; }
      .btn-secondary {
        background: transparent;
        color: #f1f5f9;
        border-color: #334155;
      }
      .btn-secondary:hover { border-color: #10b981; color: #10b981; }
      .meta {
        margin-top: 1.5rem;
        font-size: 0.8125rem;
        color: #64748b;
      }
      .meta a { color: #94a3b8; }
    </style>
  </head>
  <body>
    <main class="card" role="alert" aria-live="assertive">
      <span class="badge">PH Labs</span>
      <h1>This page didn&rsquo;t load</h1>
      <p>Something went wrong on our end. Your cart and account are safe &mdash; please try again, or head back to the home page.</p>
      <div class="actions">
        <button class="btn btn-primary" type="button" onclick="location.reload()">Try again</button>
        <a class="btn btn-secondary" href="/">Go home</a>
      </div>
      <p class="meta">Still stuck? Email <a href="mailto:support@prohealthpeptides.co.uk">support@prohealthpeptides.co.uk</a>.</p>
    </main>
  </body>
</html>`;
}
