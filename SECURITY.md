# Security policy

Dream Street is a static page that runs entirely in the browser. It has no accounts, no server of its own and no cookies, and the page itself collects no data and sends none anywhere. It runs its own code and Three.js. The optional "compare with the reference recording" switch loads YouTube's official embedded player only when you turn it on, and that player follows YouTube's own policies.

Its hosts see each request, as any web host does:

- GitHub Pages serves the site and logs visitors' IP addresses for security purposes (see [GitHub's note on data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)).
- `dream-street.jovipro.com` is served through Cloudflare. Cloudflare handles those requests under [its privacy policy](https://www.cloudflare.com/privacypolicy/) and passes each visitor's IP address on to GitHub. Cloudflare's analytics beacon is turned off for this address, and the Worker that serves it keeps no logs (see [`deploy/README.md`](deploy/README.md)).

The project receives no request logs. The maintainer can see Cloudflare's aggregate traffic figures for the domain.

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue: use GitHub's private vulnerability reporting (the repository's **Security** tab, then **Report a vulnerability**). Include the page address, the browser, and the steps to reproduce.

Only the deployment built from `main` is maintained; fixes ship by redeploying it.
