// Weekly sweep: delete files in the receipt-photos bucket that no session_photos row points to any more
// (a group or account removed at the database level leaves its files behind, since storage is not cascaded).
// Called weekly by pg_cron with no credentials (deployed without JWT verification), so anyone could call it. That is
// harmless: it only removes files nothing points to, leaves files younger than a day alone (an upload may be in
// progress), and refuses to scan more than once every 6 hours.
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "receipt-photos";
const GRACE_MS = 24 * 3600 * 1000;
const MIN_GAP_MS = 6 * 3600 * 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Entry = { name: string; id: string | null; created_at?: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
  const store = admin.storage.from(BUCKET);

  const { data: last } = await admin.from("maintenance_runs").select("last_run").eq("job", "sweep-photos").maybeSingle();
  if (last && Date.now() - new Date(last.last_run).getTime() < MIN_GAP_MS) return json({ skipped: "ran recently" });
  await admin.from("maintenance_runs").upsert({ job: "sweep-photos", last_run: new Date().toISOString() });

  const list = async (prefix: string): Promise<Entry[]> => {
    const out: Entry[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await store.list(prefix, { limit: 100, offset });
      if (error) throw new Error(error.message);
      out.push(...(data as Entry[]));
      if (!data || data.length < 100) return out;
    }
  };

  const cutoff = Date.now() - GRACE_MS;
  const files: string[] = [];
  for (const group of await list("")) {
    if (group.id) continue; // a loose file at the top level is not ours; leave it
    for (const session of await list(group.name)) {
      if (session.id) continue;
      for (const f of await list(`${group.name}/${session.name}`)) {
        if (f.id && f.created_at && new Date(f.created_at).getTime() < cutoff) files.push(`${group.name}/${session.name}/${f.name}`);
      }
    }
  }

  const known = new Set<string>();
  for (let i = 0; i < files.length; i += 200) {
    const chunk = files.slice(i, i + 200);
    const { data, error } = await admin.from("session_photos").select("path").in("path", chunk);
    if (error) return json({ error: error.message }, 500);
    for (const r of data ?? []) known.add(r.path);
  }
  const orphans = files.filter((p) => !known.has(p));
  for (let i = 0; i < orphans.length; i += 100) {
    const { error } = await store.remove(orphans.slice(i, i + 100));
    if (error) return json({ error: error.message, removedSoFar: i }, 500);
  }
  return json({ checked: files.length, removed: orphans.length });
});
