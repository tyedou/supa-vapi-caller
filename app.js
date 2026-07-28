// ---------------------------------------------------------------- config --
// The anon key is meant to be public. RLS is what protects your data, which is
// why schema.sql matters. Never put the service_role key in this file.
const supabaseUrl = "https://omlopfgdlizxsoksnboq.supabase.co";
const supabaseKey = "PASTE_YOUR_SUPABASE_ANON_KEY_HERE";

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// -------------------------------------------------------------- elements --
const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const authStatus = document.getElementById("authStatus");
const appStatus = document.getElementById("appStatus");
const userEmail = document.getElementById("userEmail");
const phoneInput = document.getElementById("phoneInput");
const callsDiv = document.getElementById("calls");

// --------------------------------------------------------------- helpers --
function setStatus(el, message, isError) {
  el.textContent = message;
  el.className = isError ? "status error" : "status";
}

// Vapi needs E.164, e.g. +14155552671.
function normalizePhone(raw) {
  return raw.trim().replace(/[\s()\-.]/g, "");
}

// ------------------------------------------------------------------ auth --
document.getElementById("signupBtn").addEventListener("click", async () => {
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    setStatus(authStatus, error.message, true);
  } else if (!data.session) {
    // "Confirm email" is on in Supabase, so there's no session yet.
    setStatus(authStatus, "Account created. Check your email to confirm, then log in.");
  } else {
    setStatus(authStatus, "Account created.");
  }
});

document.getElementById("loginBtn").addEventListener("click", async () => {
  const email = document.getElementById("loginEmail").value;
  const password = document.getElementById("loginPassword").value;

  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) setStatus(authStatus, error.message, true);
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
});

// --------------------------------------------------------------- profile --
async function loadProfile(user) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("phone_number")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    setStatus(appStatus, error.message, true);
    return;
  }
  phoneInput.value = (data && data.phone_number) || "";
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const user = (await supabaseClient.auth.getUser()).data.user;
  if (!user) return;

  const phone = normalizePhone(phoneInput.value);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    setStatus(appStatus, "Use international format, e.g. +14155552671", true);
    return;
  }

  // upsert so the row is created on first save even without the signup trigger
  const { error } = await supabaseClient
    .from("profiles")
    .upsert({ id: user.id, phone_number: phone });

  if (error) {
    setStatus(appStatus, error.message, true);
  } else {
    phoneInput.value = phone;
    setStatus(appStatus, "Saved.");
  }
});

// ----------------------------------------------------------------- calls --
async function loadCalls() {
  // No user_id filter needed: RLS returns only this user's rows.
  const { data, error } = await supabaseClient
    .from("calls")
    .select("id, summary, status, started_at")
    .order("started_at", { ascending: false });

  if (error) {
    callsDiv.textContent = error.message;
    return;
  }
  if (!data.length) {
    callsDiv.textContent = "No calls yet.";
    return;
  }

  callsDiv.innerHTML = "";
  data.forEach((call) => {
    const div = document.createElement("div");
    div.className = "call";

    const meta = document.createElement("div");
    meta.className = "call-meta";
    const when = call.started_at ? new Date(call.started_at).toLocaleString() : "unknown time";
    meta.textContent = when + " — " + (call.status || "unknown");

    const summary = document.createElement("div");
    summary.textContent = call.summary || "No summary yet.";

    div.appendChild(meta);
    div.appendChild(summary);
    callsDiv.appendChild(div);
  });
}

document.getElementById("refreshBtn").addEventListener("click", loadCalls);

document.getElementById("callBtn").addEventListener("click", async () => {
  setStatus(appStatus, "Starting call…");

  // The Vapi private key lives on the server, so the browser asks /api/call to
  // place the call and proves who it is with the Supabase access token.
  const session = (await supabaseClient.auth.getSession()).data.session;
  if (!session) return;

  try {
    const res = await fetch("/api/call", {
      method: "POST",
      headers: { Authorization: "Bearer " + session.access_token },
    });
    const body = await res.json();

    if (!res.ok) {
      setStatus(appStatus, body.error || "Call failed.", true);
      return;
    }
    setStatus(appStatus, "Calling you now. The summary appears below once the call ends.");
    loadCalls();
  } catch (err) {
    // Opening index.html from disk has no /api - it only works once deployed.
    setStatus(appStatus, "Could not reach /api/call. Is the app deployed?", true);
  }
});

// ------------------------------------------------------------------ init --
supabaseClient.auth.onAuthStateChange((_event, session) => {
  if (session) {
    authView.classList.add("hidden");
    appView.classList.remove("hidden");
    userEmail.textContent = session.user.email;
    loadProfile(session.user);
    loadCalls();
  } else {
    appView.classList.add("hidden");
    authView.classList.remove("hidden");
    setStatus(appStatus, "");
  }
});
