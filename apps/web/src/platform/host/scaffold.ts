/**
 * Starter document.
 *
 * Created the first time Rachana Designer opens an empty workspace, so the
 * canvas is never blank. It uses the same container model as the original
 * editor's block templates (`.gl-section` / `.gl-content-wrap` with
 * `data-type` markers) so every panel — layout, design system, animation —
 * has something meaningful to operate on immediately.
 */

export const SCAFFOLD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>New page</title>
  <style>
    :root {
      --gl--color--brand: #1C4076;
      --gl--color--accent: #26A5DE;
      --gl--color--text: #0f172a;
      --gl--color--muted: #475569;
      --gl--spacing--side: min(3vw, 20px);
      --gl--style--global--wide-size: 1200px;
      --gl--radius--md: 10px;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      color: var(--gl--color--text);
      line-height: 1.6;
    }
    .gl-section {
      display: flex;
      justify-content: center;
      flex-direction: column;
      align-items: center;
      padding-left: var(--gl--spacing--side);
      padding-right: var(--gl--spacing--side);
      padding-top: 72px;
      padding-bottom: 72px;
      position: relative;
    }
    .gl-content-wrap { max-width: 100%; width: var(--gl--style--global--wide-size); }
    h1 { font-size: clamp(2rem, 4.5vw, 3.25rem); line-height: 1.1; color: var(--gl--color--brand); margin: 0 0 16px; letter-spacing: -0.02em; }
    p { margin: 0 0 24px; color: var(--gl--color--muted); }
    .gl-button {
      display: inline-block;
      padding: 12px 26px;
      background: var(--gl--color--brand);
      color: #fff;
      text-decoration: none;
      border-radius: var(--gl--radius--md);
      font-weight: 600;
    }
  </style>
</head>
<body>
  <section class="gl-section alignfull" data-type="section-component">
    <div class="gl-content-wrap" data-type="content-area-component">
      <h1>Your new page</h1>
      <p>Click any element to select it, then style it with the panel on the right. Drop blocks from the toolbar, or drag templates in from the library.</p>
      <a class="gl-button" href="#">Get started</a>
    </div>
  </section>
</body>
</html>
`;
