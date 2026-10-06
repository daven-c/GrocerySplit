// Sign in by username. The username -> email lookup happens here, so emails are never exposed to the browser.
// Returns the session on success and the same generic error for an unknown user or a wrong password.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const FAIL = "Invalid login credentials";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: FAIL }, 400); }
  const username = String(body?.username ?? "").trim().toLowerCase().replace(/^@/, "");
  const password = String(body?.password ?? "");
  if (!/^[a-z0-9_]{3,20}$/.test(username) || !password) return json({ error: FAIL }, 400);

  const url = Deno.env.get("SUPABASE_URL")!;
  const opts = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, opts);
  const { data: row } = await admin.from("profiles").select("email").eq("username", username).maybeSingle();
  if (!row?.email) return json({ error: FAIL }, 400);

  const anon = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, opts);
  const { data, error } = await anon.auth.signInWithPassword({ email: row.email, password });
  if (error || !data.session) return json({ error: error?.message === "Email not confirmed" ? error.message : FAIL }, 400);
  return json({ session: { access_token: data.session.access_token, refresh_token: data.session.refresh_token } });
});
