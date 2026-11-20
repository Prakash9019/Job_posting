"use client";

import { useState } from "react";
import type { UserProfile } from "@/components/Navbar";

export default function ApplicationPreferences({ user, onSaved }: { user: UserProfile; onSaved: () => void }) {
  const [noticePeriod, setNoticePeriod] = useState(user.noticePeriod ?? "Immediate Joiner");
  const [expectedCTC, setExpectedCTC] = useState(user.expectedCTC ?? "");
  const [currentCTC, setCurrentCTC] = useState(user.currentCTC ?? "");
  
  const defaultAvailabilityDate = new Date();
  defaultAvailabilityDate.setDate(defaultAvailabilityDate.getDate() + 1);
  const [availabilityDate, setAvailabilityDate] = useState(user.availabilityDate ? new Date(user.availabilityDate).toISOString().split('T')[0] : defaultAvailabilityDate.toISOString().split('T')[0]);
  
  const [relocationPreferences, setRelocationPreferences] = useState(() => {
    try {
      return user.relocationPreferences ? JSON.parse(user.relocationPreferences) : ["Hyderabad", "Visakhapatnam", "Chennai", "Bangalore"];
    } catch (e) {
      return ["Hyderabad", "Visakhapatnam", "Chennai", "Bangalore"];
    }
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const relocationOptions = ["Hyderabad", "Visakhapatnam", "Chennai", "Bangalore", "Pune", "Mumbai", "Delhi", "Noida", "Gurgaon", "Remote"];

  const handleRelocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedOptions = Array.from(e.target.selectedOptions, option => option.value);
    setRelocationPreferences(selectedOptions);
  };

  return (
    <form className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3" onSubmit={async (event) => {
      event.preventDefault();
      setSaving(true);
      setMessage("");
      try {
        const body = {
          noticePeriod,
          expectedCTC: expectedCTC ? parseFloat(expectedCTC as string) : null,
          currentCTC: currentCTC ? parseFloat(currentCTC as string) : null,
          availabilityDate: availabilityDate ? new Date(availabilityDate).toISOString() : null,
          relocationPreferences: JSON.stringify(relocationPreferences),
        };
        const response = await fetch("/api/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        setMessage("Application preferences saved.");
        onSaved();
      } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); }
      finally { setSaving(false); }
    }}>
      <h2 className="text-sm font-semibold text-white">Application Preferences</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="flex-1 min-w-48 text-xs text-slate-300">Notice Period
          <select value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white">
            <option>Immediate Joiner</option>
            <option>15 Days</option>
            <option>1 Month</option>
            <option>2 Months</option>
            <option>3 Months</option>
          </select>
        </label>
        <label className="flex-1 min-w-48 text-xs text-slate-300">Availability Date
          <input type="date" value={availabilityDate} onChange={e => setAvailabilityDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
        </label>
        <label className="flex-1 min-w-48 text-xs text-slate-300">Expected CTC (in LPA)
          <input type="number" step="0.1" value={expectedCTC} onChange={e => setExpectedCTC(e.target.value)} placeholder="e.g., 25.5" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
        </label>
        <label className="flex-1 min-w-48 text-xs text-slate-300">Current CTC (in LPA)
          <input type="number" step="0.1" value={currentCTC} onChange={e => setCurrentCTC(e.target.value)} placeholder="e.g., 20" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
        </label>
        <label className="flex-1 min-w-48 text-xs text-slate-300 col-span-1 md:col-span-2">Relocation Preferences
          <select multiple value={relocationPreferences} onChange={handleRelocationChange} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white h-32">
            {relocationOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving ? "Saving…" : "Save Preferences"}</button>
        {message && <p role="status" className="text-xs text-indigo-300">{message}</p>}
      </div>
    </form>
  );
}
