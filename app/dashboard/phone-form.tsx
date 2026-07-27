"use client";

import { useActionState } from "react";
import { savePhoneNumber, type SaveState } from "./actions";

const initialState: SaveState = {};

export function PhoneForm({ defaultValue }: { defaultValue: string }) {
  const [state, formAction, pending] = useActionState(
    savePhoneNumber,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Your phone number</span>
        <input
          name="phone_number"
          type="tel"
          inputMode="tel"
          placeholder="+14155552671"
          defaultValue={defaultValue}
          className="rounded-md border border-black/15 bg-transparent px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/50"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>

        {state.error ? (
          <span className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </span>
        ) : null}
        {state.message ? (
          <span className="text-sm text-green-700 dark:text-green-400">
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}
