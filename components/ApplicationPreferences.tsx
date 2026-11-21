"use client";

import { useState, useMemo } from "react";
import type { UserProfile } from "@/components/Navbar";
import { X } from "lucide-react";

export default function ApplicationPreferences({ user, onSaved }: { user: UserProfile; onSaved: () => void }) {
  const [noticePeriod, setNoticePeriod] = useState(user.noticePeriod ?? "Immediate Joiner");
  const [expectedCTC, setExpectedCTC] = useState(user.expectedCTC ?? "");
  const [currentCTC, setCurrentCTC] = useState(user.currentCTC ?? "");

  const defaultAvailabilityDate = new Date();
  defaultAvailabilityDate.setDate(defaultAvailabilityDate.getDate() + 1);
  const [availabilityDate, setAvailabilityDate] = useState(user.availabilityDate ? new Date(user.availabilityDate).toISOString().split('T')[0] : defaultAvailabilityDate.toISOString().split('T')[0]);

  const [relocationPreferences, setRelocationPreferences] = useState<string[]>(() => {
    try {
      if (typeof user.relocationPreferences === 'string') {
        const parsed = JSON.parse(user.relocationPreferences);
        return Array.isArray(parsed) ? parsed : ["Hyderabad", "Visakhapatnam", "Chennai", "Bangalore"];
      }
      return ["Hyderabad", "Visakhapatnam", "Chennai", "Bangalore"];
    } catch (e) {
      return ["Hyderabad", "Visakhapatnam", "Chennai", "Bangalore"];
    }
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const allRelocationOptions = useMemo(() => ["Hyderabad", "Visakhapatnam", "Chennai", "Bangalore", "Pune", "Mumbai", "Delhi", "Noida", "Gurgaon", "Remote", "On-site", "Hybrid"], []);

  const availableRelocationOptions = useMemo(() => {
    return allRelocationOptions.filter(option => !relocationPreferences.includes(option));
  }, [allRelocationOptions, relocationPreferences]);

  const addRelocationPreference = (preference: string) => {
    if (preference && !relocationPreferences.includes(preference)) {
      setRelocationPreferences([...relocationPreferences, preference]);
    }
  };

  const removeRelocationPreference = (preference: string) => {
    setRelocationPreferences(relocationPreferences.filter(p => p !== preference));
  };

  const handleSubmit = async (event: React.FormEvent) => {
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
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4" onSubmit={handleSubmit}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-semibold text-white">Application Preferences</h2>
        <button disabled={saving} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50">
          {saving ? "Saving…" : "Save Preferences"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Column 1: Notice Period & Availability */}
        <div className="space-y-4">
          <label className="block text-xs text-slate-300">Notice Period
            <select value={noticePeriod} onChange={e => setNoticePeriod(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white">
              <option>Immediate Joiner</option>
              <option>15 Days</option>
              <option>1 Month</option>
              <option>2 Months</option>
              <option>3 Months</option>
            </select>
          </label>
          <label className="block text-xs text-slate-300">Availability Date
            <input type="date" value={availabilityDate} onChange={e => setAvailabilityDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
          </label>
        </div>

        {/* Column 2: CTC */}
        <div className="space-y-4">
          <label className="block text-xs text-slate-300">Expected CTC (LPA)
            <input type="number" step="0.1" value={expectedCTC} onChange={e => setExpectedCTC(e.target.value)} placeholder="e.g., 25.5" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
          </label>
          <label className="block text-xs text-slate-300">Current CTC (LPA)
            <input type="number" step="0.1" value={currentCTC} onChange={e => setCurrentCTC(e.target.value)} placeholder="e.g., 20" className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 p-2 text-white" />
          </label>
        </div>

        {/* Column 3: Relocation Preferences */}
        <div className="space-y-2">
          <label className="block text-xs text-slate-300">Relocation Preferences</label>
          <div className="rounded-lg border border-slate-600 bg-slate-800 p-2 min-h-[120px]">
            <div className="flex flex-wrap gap-2 mb-2">
              {relocationPreferences.map(pref => (
                <span key={pref} className="flex items-center gap-1.5 bg-indigo-500/20 text-indigo-300 text-xs font-medium px-2 py-1 rounded-full">
                  {pref}
                  <button type="button" onClick={() => removeRelocationPreference(pref)} className="text-indigo-400 hover:text-white">
                    <X size={14} />
                  </button>
                </span>
              ))}
            </div>
            <select
              value=""
              onChange={e => addRelocationPreference(e.target.value)}
              className="w-full rounded-md border border-slate-500 bg-slate-700 p-1 text-xs text-white"
              disabled={availableRelocationOptions.length === 0}
            >
              <option value="" disabled>Add a city...</option>
              {availableRelocationOptions.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
        </div>
      </div>

      {message && <p role="status" className="text-xs text-indigo-300 mt-3">{message}</p>}
    </form>
  );
}
