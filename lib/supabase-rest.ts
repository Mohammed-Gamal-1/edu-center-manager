import "server-only";

type QueryValue = string | number | boolean;

function config() {
  const runtimeEnv = (globalThis as typeof globalThis & { __CENTER_RUNTIME_ENV?: Record<string, string | undefined> }).__CENTER_RUNTIME_ENV;
  const url = runtimeEnv?.SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = runtimeEnv?.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function requestHeaders(key: string) {
  const headers: Record<string, string> = { apikey: key };
  if (!key.startsWith("sb_secret_")) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export function isSupabaseConfigured() {
  return config() !== null;
}

export async function supabaseQuery<T>(table: string, query: Record<string, QueryValue> = {}): Promise<T[]> {
  const current = config();
  if (!current) throw new Error("Supabase is not configured");
  const url = new URL(`${current.url}/rest/v1/${table}`);
  Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, String(value)));
  const response = await fetch(url, {
    headers: {
      ...requestHeaders(current.key),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase query failed (${response.status})`);
  return response.json() as Promise<T[]>;
}

export async function supabaseInsert<T>(table: string, payload: unknown): Promise<T[]> {
  const current = config();
  if (!current) throw new Error("Supabase is not configured");
  const response = await fetch(`${current.url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      ...requestHeaders(current.key),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Supabase insert failed (${response.status})`);
  return response.json() as Promise<T[]>;
}
