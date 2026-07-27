"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; message?: string };

// Vapi requires E.164 (e.g. +14155552671).
const E164 = /^\+[1-9]\d{7,14}$/;

export async function savePhoneNumber(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const raw = String(formData.get("phone_number") ?? "").trim();
  // Strip spaces, dashes and brackets people naturally type.
  const phone = raw.replace(/[\s()\-.]/g, "");

  if (!phone) return { error: "Enter a phone number." };
  if (!E164.test(phone)) {
    return {
      error: "Use international format, e.g. +14155552671.",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "You are not signed in." };

  // Upsert so the row is created on first save if no profile trigger exists.
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, phone_number: phone }, { onConflict: "id" });

  if (error) return { error: error.message };

  revalidatePath("/dashboard");
  return { message: "Saved." };
}
