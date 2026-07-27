import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// `cookies()` is async-only as of Next 16, so this helper must be awaited.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, which cannot write cookies.
            // The proxy refreshes the session instead, so this is safe to ignore.
          }
        },
      },
    }
  );
}
