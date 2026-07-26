/**
 * Local, network-free URL router for fixture-based E2E tests.
 *
 * `createFixtureFetch` returns a `fetch` implementation that resolves GitHub
 * REST API URLs against an in-memory route table. It never opens a socket.
 * The router matches the request pathname against each route's `match` glob
 * (`*` matches any run of characters) plus any query string declared on the
 * match, so paginated endpoints and SHA/ref routes can be told apart.
 */
import { FixtureRoute } from "./fixtures.js";

function globToRegExp(pattern: string): RegExp {
  // Split path and optional query so a declared `?ref=sha` is matched literally.
  const [pathPart, queryPart] = pattern.split("?");
  const escaped = pathPart.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  if (!queryPart) {
    // No query in the pattern: match any query string (or none), so a route
    // like `/contents/workflow.yml` also serves `?ref=<sha>` requests.
    return new RegExp(`^${escaped}(?:\\?.*)?$`);
  }
  const query = queryPart.replace(/[?&=]/g, "\\$&");
  return new RegExp(`^${escaped}\\?${query}$`);
}

export interface RecordedRequest {
  pathname: string;
  search: string;
  method: string;
}

export interface FixtureFetch {
  /** `fetch` implementation routed against the fixture table. */
  fetch: typeof fetch;
  /** Every request the client made, in order. */
  requests: RecordedRequest[];
}

/**
 * Build a fetch impl from one or more route sets. Later routes do not override
 * earlier ones; the first match wins, so callers can layer fixture sets
 * (baseline + failed + baseline-search + commit-compare) for a full scenario.
 */
export function createFixtureFetch(...routeSets: FixtureRoute[][]): FixtureFetch {
  const routes = routeSets.flat();
  const requests: RecordedRequest[] = [];

  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    requests.push({ pathname: url.pathname, search: url.search, method: init?.method ?? "GET" });

    for (const route of routes) {
      if (!globToRegExp(route.match).test(`${url.pathname}${url.search}`)) continue;
      if (route.status && route.status >= 400) {
        const body = route.json ? JSON.stringify(route.json()) : route.text ? route.text() : "{}";
        return new Response(body, { status: route.status, headers: { "content-type": "application/json" } });
      }
      if (route.text) return new Response(route.text(), { headers: { "content-type": "text/plain" } });
      const body = route.json ? JSON.stringify(route.json()) : "{}";
      return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Fixture fetch received an unrouted request: ${url.pathname}${url.search}`);
  };

  return { fetch, requests };
}
