// POST /api/vapi-webhook - Vapi posts the end-of-call report here.
//
// Set this URL as the assistant's Server URL in the Vapi dashboard, with the
// secret sent as the X-Vapi-Secret header.

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VAPI_WEBHOOK_SECRET } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Supabase env vars are not set." });
  }

  // Fail closed: without a configured secret anyone could post fake summaries.
  if (!VAPI_WEBHOOK_SECRET) {
    return res.status(500).json({ error: "VAPI_WEBHOOK_SECRET is not set." });
  }
  if (req.headers["x-vapi-secret"] !== VAPI_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Bad secret." });
  }

  const message = req.body && req.body.message;
  if (!message) return res.status(400).json({ error: "No message in body." });

  // Vapi sends many event types down the same URL; only this one has the summary.
  if (message.type !== "end-of-call-report") {
    return res.status(200).json({ ignored: message.type });
  }

  const vapiCallId = message.call && message.call.id;
  if (!vapiCallId) return res.status(400).json({ error: "No call id." });

  const patch = {
    summary: (message.analysis && message.analysis.summary) || null,
    transcript: (message.artifact && message.artifact.transcript) || null,
    status: "ended",
    ended_at: new Date().toISOString(),
  };

  // Matched on vapi_call_id, which /api/call stored alongside the user_id, so
  // the summary lands on the right user's row.
  const updateRes = await fetch(
    `${SUPABASE_URL}/rest/v1/calls?vapi_call_id=eq.${encodeURIComponent(vapiCallId)}`,
    {
      method: "PATCH",
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    }
  );

  if (!updateRes.ok) {
    const detail = await updateRes.text();
    return res.status(500).json({ error: "Could not store summary.", detail });
  }

  return res.status(200).json({ ok: true });
};
