"use client";

import React, { useState } from "react";
import { Lock, User, AlertCircle, Loader2, KeyRound, Check } from "lucide-react";

interface LoginModalProps {
  isOpen: boolean;
  targetUserId?: string;
  onClose?: () => void;
  onLoginSuccess: (userId: string) => void;
}

export default function LoginModal({
  isOpen,
  targetUserId = "user_a",
  onClose,
  onLoginSuccess,
}: LoginModalProps) {
  const [selectedUserOverride, setSelectedUserOverride] = useState<string | null>(null);
  const selectedUser = selectedUserOverride ?? targetUserId;
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password.trim()) {
      setError("Please enter the user password to authenticate.");
      return;
    }

    try {
      setIsLoading(true);
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: selectedUser,
          password: password.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Authentication failed. Invalid credentials.");
        return;
      }

      onLoginSuccess(selectedUser);
      if (onClose) onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickFill = (user: string) => {
    setSelectedUserOverride(user);
    if (user === "user_a") {
      setPassword("UserA_PilotPass_2026!");
    } else {
      setPassword("UserB_PilotPass_2026!");
    }
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Verified Authentication</h2>
              <p className="text-xs text-slate-400">ApplyPilot Server-Side Session Login</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* User Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Select User Identity
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                id="login-select-user-a"
                onClick={() => {
                  setSelectedUserOverride("user_a");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                  selectedUser === "user_a"
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <User className="w-4 h-4" />
                <span>User A</span>
              </button>
              <button
                type="button"
                id="login-select-user-b"
                onClick={() => {
                  setSelectedUserOverride("user_b");
                  setError(null);
                }}
                className={`flex items-center justify-center gap-2 p-3 rounded-xl border text-xs font-semibold transition-all ${
                  selectedUser === "user_b"
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm"
                    : "bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200"
                }`}
              >
                <User className="w-4 h-4" />
                <span>User B</span>
              </button>
            </div>
          </div>

          {/* Password Input */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Password
              </label>
              {process.env.NODE_ENV !== "production" && <button
                type="button"
                onClick={() => handleQuickFill(selectedUser)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                title="Fill demo credentials for local development"
              >
                <KeyRound className="w-3 h-3" />
                <span>Quick-fill default</span>
              </button>}
            </div>
            <input
              id="input-login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Enter password for ${selectedUser === "user_a" ? "User A" : "User B"}`}
              disabled={isLoading}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            id="btn-login-submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Authenticate & Create Session</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
