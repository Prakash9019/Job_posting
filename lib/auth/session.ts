import crypto from "crypto";
import { NextRequest } from "next/server";

export const VALID_USER_IDS = ["user_a", "user_b"] as const;
export type ValidUserId = (typeof VALID_USER_IDS)[number];

export const SESSION_COOKIE_NAME = "applypilot_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const OAUTH_STATE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes

export interface SessionPayload {
  userId: ValidUserId;
  createdAt: number;
  expiresAt: number;
}

export interface UserCredentials {
  userId?: string;
  username?: string;
  password?: string;
  apiKey?: string;
}

/**
 * Validates user credentials and DERIVES the verified ValidUserId.
 * Uses timing-safe constant-time string comparisons to prevent timing attacks.
 * Returns null if credentials are missing, invalid, or do not match a valid user.
 */
export function verifyCredentials(creds: unknown): ValidUserId | null {
  if (!creds || typeof creds !== "object") return null;

  const { userId, username, password, apiKey } = creds as UserCredentials;

  const rawPassword = typeof password === "string" ? password.trim() : "";
  const rawApiKey = typeof apiKey === "string" ? apiKey.trim() : "";

  // Require actual credentials (password or apiKey)
  if (!rawPassword && !rawApiKey) {
    return null;
  }

  // Configured credentials for User A
  const userAPass = process.env.USER_A_PASSWORD || (process.env.NODE_ENV !== "production" ? "UserA_PilotPass_2026!" : undefined);
  const userAKey = process.env.USER_A_API_KEY;

  // Configured credentials for User B
  const userBPass = process.env.USER_B_PASSWORD || (process.env.NODE_ENV !== "production" ? "UserB_PilotPass_2026!" : undefined);
  const userBKey = process.env.USER_B_API_KEY;

  const rawId = (typeof username === "string" ? username : typeof userId === "string" ? userId : "").toLowerCase().trim();

  const isTimingMatch = (input: string, expected?: string): boolean => {
    if (!input || !expected) return false;
    const a = Buffer.from(input, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  };

  // Check if credentials match User A
  const matchesUserA = 
    Boolean(rawPassword && isTimingMatch(rawPassword, userAPass)) ||
    Boolean(rawApiKey && userAKey && isTimingMatch(rawApiKey, userAKey));

  // Check if credentials match User B
  const matchesUserB = 
    Boolean(rawPassword && isTimingMatch(rawPassword, userBPass)) ||
    Boolean(rawApiKey && userBKey && isTimingMatch(rawApiKey, userBKey));

  if (matchesUserA && !matchesUserB) {
    // If a specific identifier was provided, it must also match User A
    if (rawId && rawId !== "user_a" && rawId !== "user a") {
      return null;
    }
    return "user_a";
  }

  if (matchesUserB && !matchesUserA) {
    // If a specific identifier was provided, it must also match User B
    if (rawId && rawId !== "user_b" && rawId !== "user b") {
      return null;
    }
    return "user_b";
  }

  return null;
}

export interface OAuthStatePayload {
  userId: ValidUserId;
  nonce: string;
  issuedAt: number;
}

function getSessionSecret(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error("Neither SESSION_SECRET nor ENCRYPTION_SECRET is configured.");
  }
  // 64 hex characters (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, "hex");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Creates a cryptographically signed session token for a given user.
 * Format: <base64url(payload)>.<base64url(hmac-sha256)>
 */
export function createSessionToken(
  userId: ValidUserId,
  durationSeconds = SESSION_MAX_AGE_SECONDS
): string {
  const now = Date.now();
  const payload: SessionPayload = {
    userId,
    createdAt: now,
    expiresAt: now + durationSeconds * 1000,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = getSessionSecret();
  const hmac = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  return `${payloadB64}.${hmac}`;
}

/**
 * Verifies a signed session token.
 * Returns the decoded SessionPayload if valid and not expired, or null if tampered/invalid.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;

  try {
    const secret = getSessionSecret();
    const expectedHmac = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

    // Timing-safe comparison to prevent timing attacks
    const sigBuf = Buffer.from(signatureB64, "utf8");
    const expBuf = Buffer.from(expectedHmac, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr) as SessionPayload;

    if (!payload || !VALID_USER_IDS.includes(payload.userId)) {
      return null;
    }

    if (typeof payload.expiresAt !== "number" || Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the session token from an incoming request.
 * Checks HttpOnly session cookie first, followed by Bearer token in Authorization header.
 * Client-controlled headers (like x-user-id) or query parameters are STRICTLY IGNORED.
 */
export function getSessionFromRequest(req: NextRequest | Request): SessionPayload | null {
  // 1. Check HttpOnly cookie
  if ("cookies" in req && typeof req.cookies?.get === "function") {
    const cookieVal = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (cookieVal) {
      const verified = verifySessionToken(cookieVal);
      if (verified) return verified;
    }
  } else {
    const cookieHeader = req.headers.get("cookie");
    if (cookieHeader) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
      if (match && match[1]) {
        const verified = verifySessionToken(decodeURIComponent(match[1]));
        if (verified) return verified;
      }
    }
  }

  // 2. Check Authorization Bearer header (for programmatic/test clients)
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    const verified = verifySessionToken(token);
    if (verified) return verified;
  }

  return null;
}

/**
 * Cookie options for setting the session cookie on NextResponse.
 */
export const SESSION_COOKIE_OPTIONS = {
  name: SESSION_COOKIE_NAME,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_MAX_AGE_SECONDS,
};

/**
 * Creates a cryptographically signed OAuth state token.
 * Prevents CSRF and cross-user OAuth state tampering.
 */
export function signOAuthState(userId: ValidUserId): string {
  const payload: OAuthStatePayload = {
    userId,
    nonce: crypto.randomBytes(16).toString("hex"),
    issuedAt: Date.now(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const secret = getSessionSecret();
  const hmac = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

  return `${payloadB64}.${hmac}`;
}

/**
 * Verifies a signed OAuth state token and ensures it has not expired.
 */
export function verifyOAuthState(token: string): OAuthStatePayload | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadB64, signatureB64] = parts;

  try {
    const secret = getSessionSecret();
    const expectedHmac = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");

    const sigBuf = Buffer.from(signatureB64, "utf8");
    const expBuf = Buffer.from(expectedHmac, "utf8");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const jsonStr = Buffer.from(payloadB64, "base64url").toString("utf8");
    const payload = JSON.parse(jsonStr) as OAuthStatePayload;

    if (!payload || !VALID_USER_IDS.includes(payload.userId)) {
      return null;
    }

    // Must be verified within OAUTH_STATE_MAX_AGE_MS (15 minutes)
    if (Date.now() - payload.issuedAt > OAUTH_STATE_MAX_AGE_MS) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
