import { i18n } from "./i18n";

const grants = new Map<string, string>();
let sessionPromise: Promise<string> | null = null;

export function rememberGrant(path: string, grant?: string) {
  if (path && grant) grants.set(path, grant);
}

export function takeGrant(path: string) {
  const grant = grants.get(path);
  if (grant) grants.delete(path);
  return grant;
}

async function sessionToken() {
  if (!sessionPromise) {
    sessionPromise = fetch("/api/health")
      .then((response) => response.json())
      .then((body: { session?: string }) => (typeof body.session === "string" ? body.session : ""))
      .catch(() => "");
  }
  return sessionPromise;
}

export function apiText(code: string | undefined, fallback: string, params?: Record<string, unknown>): string {
  if (!code) return fallback;
  const value = i18n.t(`api.${code}`, { ...(params || {}), defaultValue: fallback });
  return typeof value === "string" ? value : fallback;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const extra = init?.headers;
  if (extra && typeof extra === "object" && !Array.isArray(extra)) {
    for (const [key, value] of Object.entries(extra)) {
      if (typeof value === "string") headers[key] = value;
    }
  }
  if (path.startsWith("/api/dialog") || path.startsWith("/api/local/") || path.startsWith("/api/fs/")) {
    const session = await sessionToken();
    if (session) headers["X-Studio-Session"] = session;
  }
  const response = await fetch(path, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const detail = typeof body.detail === "string" ? body.detail : response.statusText;
    const code = typeof body.code === "string" ? body.code : undefined;
    const params = body.params && typeof body.params === "object" ? (body.params as Record<string, unknown>) : undefined;
    const error = new Error(apiText(code, detail, params)) as Error & { code?: string };
    error.code = code;
    throw error;
  }
  return body as T;
}
