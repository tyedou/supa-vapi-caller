module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPI_WEBHOOK_SECRET } = process.env;

  const missing = Object.entries({
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    VAPI_WEBHOOK_SECRET,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    return res.status(500).json({
      error: `Missing environment variable(s): ${missing.join(", ")}.`,
    });
  }
  if (req.headers["x-vapi-secret"] !== VAPI_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Bad secret." });
  }

  const message = req.body && req.body.message;
  if (!message) return res.status(400).json({ error: "No message in body." });

  if (message.type !== "end-of-call-report") {
    return res.status(200).json({ ignored: message.type });
  }

  const service = {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  const call = message.call || {};

  let userId = call.metadata && call.metadata.supabase_user_id;

  if (!userId) {
    const number = call.customer && call.customer.number;
    if (!number) {
      return res.status(400).json({ error: "Cannot attribute call to a user." });
    }
    const lookup = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?phone_number=eq.${encodeURIComponent(number)}&select=id`,
      { headers: service }
    );
    const matches = await lookup.json();
    if (!matches.length) {
      return res.status(404).json({ error: "No profile with that phone number." });
    }
    userId = matches[0].id;
  }

  const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/calls`, {
    method: "POST",
    headers: { ...service, Prefer: "return=minimal" },
    body: JSON.stringify({
      user: userId,
      summary: (message.analysis && message.analysis.summary) || null,
      call_time: new Date().toISOString(),
    }),
  });

  if (!insertRes.ok) {
    const detail = await insertRes.text();
    return res.status(500).json({ error: "Could not store summary.", detail });
  }

  return res.status(200).json({ ok: true });
};
