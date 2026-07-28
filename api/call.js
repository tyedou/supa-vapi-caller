// POST /api/call - starts a Vapi call to the signed-in user's saved number.
//
// Runs on the server because the Vapi private key must never reach the browser.
// Uses plain fetch against Supabase's REST API, so there are no dependencies.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPI_API_KEY,
    VAPI_ASSISTANT_ID,
    VAPI_PHONE_NUMBER_ID,
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase env vars are not set." });
  }
  if (!VAPI_API_KEY || !VAPI_ASSISTANT_ID || !VAPI_PHONE_NUMBER_ID) {
    return res.status(500).json({ error: "Vapi is not configured yet." });
  }

  const service = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  // 1. Identify the caller from the Supabase access token the browser sent.
  const token = (req.headers.authorization || "").replace(/^Bearer /, "");
  if (!token) return res.status(401).json({ error: "Not signed in." });

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userRes.ok) return res.status(401).json({ error: "Invalid session." });
  const user = await userRes.json();

  // 2. Read their saved number. The service role bypasses RLS, so scope the
  //    query to this user explicitly.
  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=phone_number`,
    { headers: service }
  );
  const rows = await profileRes.json();
  const phone = rows[0] && rows[0].phone_number;
  if (!phone) return res.status(400).json({ error: "Save a phone number first." });

  // 3. Place the call.
  const vapiRes = await fetch("https://api.vapi.ai/call", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      assistantId: VAPI_ASSISTANT_ID,
      phoneNumberId: VAPI_PHONE_NUMBER_ID,
      customer: { number: phone },
    }),
  });
  const call = await vapiRes.json();
  if (!vapiRes.ok) {
    return res.status(502).json({ error: call.message || "Vapi rejected the call." });
  }

  // 4. Record it so the webhook has a row to attach the summary to.
  await fetch(`${SUPABASE_URL}/rest/v1/calls`, {
    method: "POST",
    headers: { ...service, Prefer: "return=minimal" },
    body: JSON.stringify({
      user_id: user.id,
      vapi_call_id: call.id,
      status: call.status || "queued",
    }),
  });

  return res.status(200).json({ ok: true, callId: call.id });
};
