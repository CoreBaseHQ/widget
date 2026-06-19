# @corebasehq/widget

Embeddable chat widget for [CoreBase](https://corebasehq.com). Preact + shadow DOM, ~67KB gzipped, drops into any page (PHP, Rails, plain HTML) with a script tag.

## Install

### Script tag (recommended for legacy / non-bundled apps)

```html
<script
  src="https://unpkg.com/@corebasehq/widget/dist/corebase-widget.js"
  defer
></script>

<script>
  window.addEventListener("DOMContentLoaded", () => {
    window.CorebaseWidget.init({
      apiBaseUrl: "https://api.corebasehq.com",
      publicId: "YOUR_TENANT_PUBLIC_ID",
      authToken: "<server_generated_jwt>",
    });
  });
</script>
```

### npm

```bash
npm install @corebasehq/widget
```

```ts
import "@corebasehq/widget";

window.CorebaseWidget.init({
  apiBaseUrl: "https://api.corebasehq.com",
  publicId: "YOUR_TENANT_PUBLIC_ID",
  authToken: "<server_generated_jwt>",
});
```

The bundle attaches `window.CorebaseWidget` on load. Call `init()` once your auth token is ready. There is no auto-mount.

## API

```ts
window.CorebaseWidget.init({
  apiBaseUrl: string,         // CoreBase backend URL
  publicId?: string,          // Tenant public ID (Settings → Widget)
  authToken?: string,         // Static JWT
  getAuthToken?: () => Promise<string> | string,  // Async fetcher for refresh
  title?: string,             // Header text (default: "CoreBase")
  placeholder?: string,       // Input placeholder (default: "Ask a question")
  initialOpen?: boolean,      // Start expanded (default: false)
  containerId?: string,       // Mount inside an existing element ID;
                              // omit for floating launcher
  chatId?: string,            // Resume a specific conversation
  primaryColor?: string,      // Accent color, any CSS color (default: #0b5fff)
  logoUrl?: string,           // Custom logo in header
  zIndex?: number,            // Stacking order (default: 2147483000)
  fontFamily?: string,        // CSS font-family (default: native system stack)
  fontUrl?: string,           // Stylesheet URL that loads the font (e.g. Google Fonts)
});

window.CorebaseWidget.destroy();  // Tear down and remove from DOM
```

Either `authToken` or `getAuthToken` is required for authenticated calls. Use `getAuthToken` when your token needs to be refreshed periodically — the widget calls it before each request.

## JWT

The token must be signed with your tenant's B2B secret (CoreBase panel → Settings → Widget → Rotate secret). Minimum claims:

| Claim | Required | Description |
|---|---|---|
| `sub` | yes | End-user ID (used in audit logs) |
| `role` / `is_admin` | no | Promotes the user to admin (defaults to non-admin) |
| `user_attrs` | no | Object with RBAC attributes (e.g. `{ "dept": "hr" }`) |
| `exp` | recommended | Standard expiry — keep short (15–30 min), refresh via `getAuthToken` |

Sign on your server only — the secret never reaches the browser.

## Security

- **Shadow DOM isolation** — widget styles never leak into the host page and vice versa.
- **DOMPurify sanitization** — markdown rendered from model output is sanitized against XSS before insertion.
- **TLS 1.2+** for all traffic to CoreBase Cloud. Raw row data never crosses the wire — see [Zero Raw Data Egress](https://docs.corebasehq.com/concepts/zero-raw-data-egress).
- **Server-side JWT verification** — expired or invalid tokens are rejected by CoreBase before the request hits any tenant data.

## Docs

- [Widget integration guide](https://docs.corebasehq.com/platform/widget) — full walkthrough with PHP / Node JWT examples
- [API reference](https://docs.corebasehq.com/api-reference/introduction)

## License

MIT
