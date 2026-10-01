// Cloudflare Worker for https://dream-street.jovipro.com/, deployed by hand (see deploy/README.md).
//
// GitHub Pages serves a project at one address only: with a custom domain set, github.io redirects to it. So Pages
// keeps https://gamebygame.github.io/dream-street/ and this Worker serves the same files under the jovipro name. If
// jovipro.com ever lapses, github.io keeps working on its own.

const UPSTREAM_ORIGIN = 'https://gamebygame.github.io';
const UPSTREAM_BASE = '/dream-street';

// A static site needs only these, so the visitor's other headers stay at Cloudflare. Cloudflare itself still adds the
// visitor's address (CF-Connecting-IP) to every Worker request for an outside origin, and a Worker cannot remove it.
const FORWARDED_HEADERS = ['accept', 'accept-language', 'if-modified-since', 'if-none-match', 'range'];

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.protocol === 'http:') {
      url.protocol = 'https:';
      return Response.redirect(url.href, 301);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed\n', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
      const value = request.headers.get(name);
      if (value !== null) headers.set(name, value);
    }
    const upstreamUrl = UPSTREAM_ORIGIN + UPSTREAM_BASE + url.pathname + url.search;
    // Nothing is kept in Cloudflare's cache, so this address always serves exactly what github.io serves now.
    const upstream = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      redirect: 'manual',
      cache: 'no-store',
    });
    const response = new Response(upstream.body, upstream);

    const location = upstream.headers.get('location');
    if (location) {
      const target = new URL(location, upstreamUrl);
      const underBase = target.pathname === UPSTREAM_BASE || target.pathname.startsWith(UPSTREAM_BASE + '/');
      if (target.origin === UPSTREAM_ORIGIN && underBase) {
        const path = target.pathname.slice(UPSTREAM_BASE.length) || '/';
        response.headers.set('location', url.origin + path + target.search + target.hash);
      } else if (target.host === url.host) {
        // Pages has this name as its custom domain again and sends github.io back here; following it would loop.
        return new Response('Dream Street is moving between addresses. Please try again in a moment.\n', {
          status: 503,
          headers: { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8', 'retry-after': '10' },
        });
      }
    }

    // GitHub's caching headers stay as they are. no-transform stops Cloudflare from rewriting the page (for example
    // injecting its analytics beacon), so both addresses serve the same bytes.
    const cacheControl = response.headers.get('cache-control');
    response.headers.set('cache-control', cacheControl ? `${cacheControl}, no-transform` : 'no-transform');
    return response;
  },
};
