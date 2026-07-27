import { redirect } from "next/navigation";
import { signOut } from "@/app/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { PhoneForm } from "./phone-form";

type CallRow = {
  id: string;
  summary: string | null;
  status: string | null;
  started_at: string | null;
  ended_at: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // The proxy already gates this route, but Server Components must verify auth
  // themselves rather than trusting the proxy alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes both queries to the signed-in user; no user_id filter needed,
  // though the policies are what actually enforce it.
  const [{ data: profile }, { data: calls, error: callsError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("phone_number")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("calls")
        .select("id, summary, status, started_at, ended_at")
        .order("started_at", { ascending: false }),
    ]);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 p-6">
      <header className="flex items-center justify-between gap-4 border-b border-black/10 pb-4 dark:border-white/15">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Your account</h1>
          <p className="text-sm text-black/60 dark:text-white/60">{user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-md border border-black/15 px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="mt-8">
        <PhoneForm defaultValue={profile?.phone_number ?? ""} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold tracking-tight">Call history</h2>

        {callsError ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            Could not load calls: {callsError.message}
          </p>
        ) : !calls?.length ? (
          <p className="mt-3 text-sm text-black/60 dark:text-white/60">
            No calls yet.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {(calls as CallRow[]).map((call) => (
              <li
                key={call.id}
                className="rounded-lg border border-black/10 p-4 dark:border-white/15"
              >
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{formatDate(call.started_at)}</span>
                  <span className="text-black/60 dark:text-white/60">
                    {call.status ?? "unknown"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-black/80 dark:text-white/80">
                  {call.summary ?? "No summary yet."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
