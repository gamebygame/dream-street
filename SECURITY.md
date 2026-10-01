# Security policy

Dream Street is a static page that runs entirely in the browser. It has no accounts, no server of its own and no cookies, and the page itself collects no data and sends none anywhere. It runs its own code and Three.js. The optional "compare with the reference recording" switch loads YouTube's official embedded player only when you turn it on, and that player follows YouTube's own policies.

The site is hosted on GitHub Pages, which, like any web host, sees each request: GitHub logs visitors' IP addresses for security purposes (see [GitHub's note on data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)). The project does not receive those logs.

## Reporting a vulnerability

Please report vulnerabilities privately, not in a public issue: use GitHub's private vulnerability reporting (the repository's **Security** tab, then **Report a vulnerability**). Include the page address, the browser, and the steps to reproduce.

Only the deployment built from `main` is maintained; fixes ship by redeploying it.
