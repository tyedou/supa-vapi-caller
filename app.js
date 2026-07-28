const supabaseUrl = "https://ieubbcixvmdbjyplficb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlldWJiY2l4dm1kYmp5cGxmaWNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNjU3MDcsImV4cCI6MjEwMDc0MTcwN30.ji1bvFQVyHbMEKZ-RNse2NmMT0tFgxzc2DPYE254p0A";

const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const authStatus = document.getElementById("authStatus");
const appStatus = document.getElementById("appStatus");
const userEmail = document.getElementById("userEmail");
const phoneInput = document.getElementById("phoneInput");
const callsDiv = document.getElementById("calls");

function setStatus(el, message, isError) {
  el.textContent = message;
  el.className = isError ? "status error" : "status";
}

function normalizePhone(raw) {
  return raw.trim().replace(/[\s()\-.]/g, "");
}

document.getElementById("signupBtn").addEventListener("click", async () => {
  const email = document.getElementById("signupEmail").value;
  const password = document.getElementById("signupPassword").value;

  const { data, error } = await supabaseClient.auth.signUp({ email, password });

  if (error) {
    setStatus(authStatus, error.message, true);
  } else if (!data.session) {
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

async function loadCalls() {
  const { data, error } = await supabaseClient
    .from("calls")
    .select("id, summary, call_time")
    .order("call_time", { ascending: false });

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
    meta.textContent = call.call_time
      ? new Date(call.call_time).toLocaleString()
      : "unknown time";

    const summary = document.createElement("div");
    summary.textContent = call.summary || "No summary yet.";

    div.appendChild(meta);
    div.appendChild(summary);
    callsDiv.appendChild(div);
  });
}

document.getElementById("refreshBtn").addEventListener("click", loadCalls);

const callBtn = document.getElementById("callBtn");

callBtn.addEventListener("click", async () => {
  if (callBtn.disabled) return;
  callBtn.disabled = true;
  setStatus(appStatus, "Starting call…");

  const session = (await supabaseClient.auth.getSession()).data.session;
  if (!session) {
    callBtn.disabled = false;
    return;
  }

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
    setStatus(appStatus, "Calling you now. Hit Refresh after the call to see the summary.");
  } catch (err) {
    setStatus(appStatus, "Could not reach /api/call. Is the app deployed?", true);
  } finally {
    setTimeout(() => { callBtn.disabled = false; }, 5000);
  }
});

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
