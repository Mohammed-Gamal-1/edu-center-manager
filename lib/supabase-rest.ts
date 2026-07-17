import "server-only";

type QueryValue = string | number | boolean;

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
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
      apikey: current.key,
      Authorization: `Bearer ${current.key}`,
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
      apikey: current.key,
      Authorization: `Bearer ${current.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Supabase insert failed (${response.status})`);
  return response.json() as Promise<T[]>;
}
