# @corebase/widget

Embeddable chat widget for [CoreBase](https://corebasehq.com). Preact + shadow DOM, ~40KB gzipped, drops into any page (PHP, Rails, plain HTML) with a single script tag.

## Install

### Script tag (recommended for legacy / non-bundled apps)

```html
<script
  src="https://unpkg.com/@corebase/widget/dist/corebase-widget.js"
  data-public-id="YOUR_TENANT_PUBLIC_ID"
  data-jwt="<server_generated_jwt>"
  defer>
</script>
```

### npm

```bash
npm install @corebase/widget
```

```ts
import "@corebase/widget";
```

The IIFE bundle auto-mounts on load — no API to call.

## Configuration

| Data attribute | Required | Description |
|---|---|---|
| `data-public-id` | yes | Tenant public ID from CoreBase panel → Settings → Widget |
| `data-jwt` | yes | Server-signed JWT (`user_id`, `is_admin`, optional `user_attrs`) |
| `data-mount-selector` | no | CSS selector to mount inline; omit for floating launcher |
| `data-theme` | no | `light` / `dark` — defaults to host page color scheme |
| `data-language` | no | `en` / `tr` — defaults to browser locale |

JWT must be signed with the tenant's B2B secret (Settings → Widget → Rotate secret).

## Security

- Iframe + shadow DOM isolated — host page CSS / JS cannot affect widget and vice versa.
- All traffic to CoreBase Cloud over TLS 1.2+. Raw row data never crosses the wire — see [Zero Raw Data Egress](https://docs.corebasehq.com/concepts/zero-raw-data-egress).
- JWT validation happens server-side per CoreBase; expired tokens are rejected.

## Docs

- [Widget integration guide](https://docs.corebasehq.com/platform/widget)
- [Generating the JWT (PHP / Node examples)](https://docs.corebasehq.com/platform/widget#generating-the-jwt-server-side)

## License

MIT
