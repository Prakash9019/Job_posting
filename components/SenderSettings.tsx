"use client";

import { useState } from "react";
import type { UserProfile } from "@/components/Navbar";

export default function SenderSettings({ user, onSaved }: { user: UserProfile; onSaved: () => void }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <form className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      setMessage("");
      try {
        const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email }) });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        setMessage("Saved. Regenerate existing drafts to update their signature and wording.");
        onSaved();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); }
      finally { setSaving(false); }
    }}>
      <h2 className="text-sm font-semibold text-white">Your sender details · used for every application</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-48 text-xs text-slate-300">Your name / email signature
          <input required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Suryaprakash" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
        </label>
        <label className="flex-1 min-w-48 text-xs text-slate-300">From email
          <input required type="email" list="connected-sender-emails" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@gmail.com" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
          <datalist id="connected-sender-emails">{user.gmailAccounts.filter(a => a.isConnected).map(a => <option key={a.id} value={a.email} />)}</datalist>
        </label>
        <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "Saving…" : "Save sender"}</button>
      </div>
      <p className="text-xs text-slate-400">Emails are sent through this connected Gmail account. To use another address, connect it with Connect Gmail first. Review From and To on each draft before approving.</p>
      {message && <p role="status" className="text-xs text-indigo-300">{message}</p>}
    </form>
  );
}
