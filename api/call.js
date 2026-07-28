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

  const missing = Object.entries({
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPI_API_KEY,
    VAPI_ASSISTANT_ID,
    VAPI_PHONE_NUMBER_ID,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    return res.status(500).json({
      error:
        `Missing environment variable(s): ${missing.join(", ")}. ` +
        "Set them in Vercel -> Settings -> Environment Variables, then redeploy.",
    });
  }

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

  const profileRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=phone_number`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  const rows = await profileRes.json();
  const phone = rows[0] && rows[0].phone_number;
  if (!phone) return res.status(400).json({ error: "Save a phone number first." });

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
      metadata: { supabase_user_id: user.id },
    }),
  });
  const call = await vapiRes.json();
  if (!vapiRes.ok) {
    return res.status(502).json({ error: call.message || "Vapi rejected the call." });
  }

  return res.status(200).json({ ok: true, callId: call.id });
};
