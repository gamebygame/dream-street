# Deployment

Dream Street is served at two addresses. Both serve the same build:

| Address | Served by |
| --- | --- |
| <https://dream-street.jovipro.com/> | A Cloudflare Worker ([`worker.js`](worker.js)) on the `jovipro.com` zone, which fetches every path from GitHub Pages |
| <https://gamebygame.github.io/dream-street/> | GitHub Pages, published from `main` by `.github/workflows/pages.yml` |

GitHub Pages serves a project at one address only: once a custom domain is set, github.io redirects to it. So Pages has no custom domain, and the Worker serves the same files under the jovipro name. github.io does not depend on jovipro.com and keeps working if that domain lapses.

## What the Worker does

- Paths and query strings map one to one onto `https://gamebygame.github.io/dream-street/`. Redirects from Pages, such as the trailing slash added to a folder, are rewritten so that they stay on jovipro.
- Only `GET` and `HEAD` are served, and plain HTTP is redirected to HTTPS.
- It passes on only the request headers a static site needs: `Accept`, `Accept-Language`, and the conditional and range headers. Cloudflare itself still adds the visitor's IP address (`CF-Connecting-IP`) to every Worker request for an outside origin, so GitHub receives it.
- Nothing is cached at Cloudflare, so jovipro always serves what github.io serves at that moment.
- GitHub's caching headers reach the browser unchanged, with `no-transform` added. This stops Cloudflare from rewriting the page; for example, it does not inject its analytics beacon.
- If Pages is ever given the custom domain again, github.io redirects back to jovipro. The Worker then answers 503 instead of looping.

[`tests/unit/worker.test.js`](../tests/unit/worker.test.js) checks the path mapping, the header allowlist, redirect rewriting and the 503 guard.

## How it is set up

The Worker is deployed by hand: in the Cloudflare dashboard, open Workers & Pages → `dream-street` → Edit code, paste `worker.js` and deploy. A change to `worker.js` takes effect only after this redeploy.

On the `jovipro.com` zone:

| Item | Setting |
| --- | --- |
| DNS record | `dream-street` is `AAAA 100::`, proxied. It never reaches an origin, because the Worker answers every request. |
| Worker route | `dream-street.jovipro.com/*` → `dream-street`, failure mode "fail closed". If the Worker cannot run, visitors get an error page rather than a request to the record's origin. |
| Configuration rule | "dream-street: no RUM injection" turns off Web Analytics for this hostname only. |
| Worker settings | Logs, the `workers.dev` address and preview URLs are off. |

## Rolling back

- **A bad build:** revert the commit on `main`. Pages redeploys, and the Worker serves the result at once. Browsers may keep a page for up to 10 minutes, GitHub's cache lifetime.
- **A bad Worker:** in the dashboard, deploy the previous version from the Worker's Deployments tab. github.io is unaffected.
- **Back to a single address:** remove the route, set the Pages custom domain to `dream-street.jovipro.com`, and replace the DNS record with `CNAME gamebygame.github.io`, DNS only. github.io then redirects to jovipro, as it did before 0.6.0.

Whenever the Pages custom domain changes, re-run the Pages workflow. GitHub's CDN can keep the old redirect for a folder such as `/dream-street/` until the next deployment clears it.
