// Admin-only user management. The service-role key never leaves this function.
// Every request must carry a signed-in user's JWT, and that user must have a row in public.admins.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
  const { data: { user }, error: authError } = await caller.auth.getUser();
  if (authError || !user) return json({ error: "Not signed in" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: adminRow } = await admin.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!adminRow) return json({ error: "Admins only" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (body.action === "create") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "Enter a valid email address." }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (!name || name.length > 60) return json({ error: "Name is required (max 60 characters)." }, 400);

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: body.confirm !== false, // skip the confirmation email by default ("force create")
      user_metadata: { name },
    });
    if (error || !data.user) {
      const exists = /already|registered|exists/i.test(error?.message ?? "");
      return json({ error: exists ? "A user with that email already exists." : (error?.message ?? "Could not create user") }, exists ? 409 : 400);
    }
    if (body.make_admin === true) {
      const { error: adminErr } = await admin.from("admins").insert({ user_id: data.user.id });
      if (adminErr) return json({ error: `User created but could not be made admin: ${adminErr.message}`, id: data.user.id }, 500);
    }
    return json({ id: data.user.id, email, name });
  }

  if (body.action === "confirm") {
    const id = String(body.user_id ?? "");
    if (!id) return json({ error: "user_id is required" }, 400);
    const { error } = await admin.auth.admin.updateUserById(id, { email_confirm: true });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});
