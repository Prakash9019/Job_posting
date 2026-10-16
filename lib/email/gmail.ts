import { google } from "googleapis";
import { prisma } from "@/lib/db/prisma";
import { encrypt, decrypt } from "@/lib/security/encryption";
import { getStorageProvider } from "@/lib/storage";
import { getCandidateFilename } from "@/lib/ats/tailor";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in .env to connect Gmail."
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

/**
 * Generate Google OAuth authorization URL with signed state token.
 */
export function getAuthorizationUrl(state: string): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // Force consent so Google issues a refresh token
    scope: SCOPES,
    state, // cryptographically signed state token
  });
}

/**
 * Exchange OAuth callback code for tokens and save to database.
 */
export async function handleOAuthCallback(code: string, userId: string) {
  const oauth2Client = getOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Failed to obtain access token from Google.");
  }

  oauth2Client.setCredentials(tokens);

  // Retrieve user email from Google
  const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const email = userInfo.data.email;

  if (!email) {
    throw new Error("Unable to retrieve email address from authorized Google account.");
  }

  const encryptedAccessToken = encrypt(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : undefined;

  const expiryDate = tokens.expiry_date ? new Date(tokens.expiry_date) : null;

  // Persist or update GmailAccount for this user
  // If no new refresh token returned, retain previous refresh token
  const account = await prisma.gmailAccount.upsert({
    where: {
      userId_email: {
        userId,
        email,
      },
    },
    update: {
      accessTokenEncrypted: encryptedAccessToken,
      ...(encryptedRefreshToken ? { refreshTokenEncrypted: encryptedRefreshToken } : {}),
      tokenExpiry: expiryDate,
      scope: tokens.scope || SCOPES.join(" "),
      isConnected: true,
      lastSyncedAt: new Date(),
    },
    create: {
      userId,
      email,
      accessTokenEncrypted: encryptedAccessToken,
      refreshTokenEncrypted: encryptedRefreshToken,
      tokenExpiry: expiryDate,
      scope: tokens.scope || SCOPES.join(" "),
      isConnected: true,
      lastSyncedAt: new Date(),
    },
  });

  // Update user's primary email if empty
  await prisma.user.update({
    where: { id: userId },
    data: { email },
  });

  return account;
}

/**
 * Disconnect a user's Gmail account
 */
export async function disconnectGmailAccount(userId: string, email?: string) {
  if (email) {
    await prisma.gmailAccount.updateMany({
      where: { userId, email },
      data: { isConnected: false },
    });
  } else {
    await prisma.gmailAccount.updateMany({
      where: { userId },
      data: { isConnected: false },
    });
  }
}

/**
 * Get authenticated OAuth2Client for a user's Gmail account.
 */
export async function getAuthenticatedClient(userId: string, requestedEmail?: string) {
  const account = await prisma.gmailAccount.findFirst({
    where: {
      userId,
      isConnected: true,
      ...(requestedEmail ? { email: requestedEmail } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  if (!account) {
    throw new Error(`No connected Gmail account found for user '${userId}'.`);
  }

  const oauth2Client = getOAuth2Client();
  const accessToken = decrypt(account.accessTokenEncrypted);
  const refreshToken = account.refreshTokenEncrypted
    ? decrypt(account.refreshTokenEncrypted)
    : null;

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
    expiry_date: account.tokenExpiry ? account.tokenExpiry.getTime() : undefined,
  });

  // Check if token is expired or about to expire in next 2 minutes
  const now = Date.now();
  const isExpired = account.tokenExpiry && account.tokenExpiry.getTime() <= now + 120000;

  if (isExpired && refreshToken) {
    try {
      const refreshed = await oauth2Client.refreshAccessToken();
      const newTokens = refreshed.credentials;
      if (newTokens.access_token) {
        await prisma.gmailAccount.update({
          where: { id: account.id },
          data: {
            accessTokenEncrypted: encrypt(newTokens.access_token),
            tokenExpiry: newTokens.expiry_date ? new Date(newTokens.expiry_date) : null,
            lastSyncedAt: new Date(),
          },
        });
        oauth2Client.setCredentials(newTokens);
      }
    } catch (refreshErr) {
      console.error("Token refresh failed:", refreshErr);
      await prisma.gmailAccount.update({
        where: { id: account.id },
        data: { isConnected: false },
      });
      throw new Error(
        "Gmail authorization expired or was revoked. (Note: Google Cloud apps in 'Testing' mode have refresh tokens that expire after 7 days. Reconnect your account or publish the app to Production in Google Cloud Console)."
      );
    }
  }

  return { oauth2Client, senderEmail: account.email };
}

/**
 * Build RFC 2822 MIME message with optional attachment and encode as base64url.
 */
export function buildMimeMessage(params: {
  from: string;
  to: string;
  subject: string;
  body: string;
  attachment?: {
    filename: string;
    content: Buffer;
    contentType?: string;
  };
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}): string {
  const { from, to, subject, body, attachment, attachments } = params;
  const boundary = `__boundary_${Date.now()}_${Math.random().toString(36).substring(2)}__`;

  const cleanSubject = subject.replace(/[\r\n]+/g, " ");

  let mime = "";
  mime += `From: ${from}\r\n`;
  mime += `To: ${to}\r\n`;
  mime += `Date: ${new Date().toUTCString()}\r\n`;
  mime += `Subject: =?UTF-8?B?${Buffer.from(cleanSubject, "utf-8").toString("base64")}?=\r\n`;
  mime += `MIME-Version: 1.0\r\n`;

  const allAttachments = attachments && attachments.length > 0
    ? attachments
    : (attachment ? [attachment] : []);

  if (allAttachments.length > 0) {
    mime += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
    mime += `--${boundary}\r\n`;
    mime += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
    mime += `${body}\r\n\r\n`;

    for (const att of allAttachments) {
      mime += `--${boundary}\r\n`;
      const cleanFilename = att.filename.replace(/["\r\n]/g, "");
      const contentType = att.contentType || "application/pdf";
      mime += `Content-Type: ${contentType}; name="${cleanFilename}"\r\n`;
      mime += `Content-Disposition: attachment; filename="${cleanFilename}"\r\n`;
      mime += `Content-Transfer-Encoding: base64\r\n\r\n`;
      // Chunk base64 into 76-character lines per RFC 2045
      const base64Data = att.content.toString("base64");
      const chunked = base64Data.match(/.{1,76}/g)?.join("\r\n") || base64Data;
      mime += `${chunked}\r\n\r\n`;
    }
    mime += `--${boundary}--\r\n`;
  } else {
    mime += `Content-Type: text/plain; charset="UTF-8"\r\n`;
    mime += `Content-Transfer-Encoding: 8bit\r\n\r\n`;
    mime += `${body}\r\n`;
  }

  // Base64URL encoding (RFC 4648)
  return Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Send an email draft through Gmail API.
 */
export async function sendEmailDraft(params: {
  draftId: string;
  userId: string;
  senderEmail?: string;
}) {
  const { draftId, userId, senderEmail: requestedSenderEmail } = params;

  // 1. Fetch draft and related data
  const draft = await prisma.emailDraft.findUnique({
    where: { id: draftId },
    include: {
      resume: true,
      batch: true,
    },
  });

  if (!draft) {
    throw new Error(`Email draft ${draftId} not found.`);
  }

  if (draft.userId !== userId) {
    throw new Error("Security Violation: Draft does not belong to the active user.");
  }

  if (draft.reviewStatus !== "APPROVED") {
    throw new Error("Draft must be explicitly approved before sending.");
  }

  // 2. Duplicate send prevention: check if already sent successfully to this recipient
  const existingSent = await prisma.sendAttempt.findFirst({
    where: {
      draftId,
      status: "SENT",
    },
  });

  if (existingSent) {
    throw new Error(`Email draft has already been sent to ${draft.recipientEmail} on ${existingSent.createdAt.toISOString()}`);
  }

  // 3. Obtain authenticated client for this user
  const profile = await prisma.user.findUnique({ where: { id: userId } });
  if (!profile?.email || !requestedSenderEmail || requestedSenderEmail !== profile.email) {
    throw new Error("Sender changed or is missing. Save your From address and review it before sending.");
  }
  const { oauth2Client, senderEmail } = await getAuthenticatedClient(
    userId,
    requestedSenderEmail
  );

  // 4. Create pending SendAttempt record
  const attempt = await prisma.sendAttempt.create({
    data: {
      draftId,
      userId,
      senderEmail,
      recipientEmail: draft.recipientEmail,
      subject: draft.subject,
      status: "SENDING",
    },
  });

  try {
    // 5. Read resume attachment if attached
    let attachmentFilename = "Resume.pdf";
    let pdfBuffer: Buffer | null = null;
    let contentType = "application/pdf";

    if (draft.resume) {
      const storage = getStorageProvider();
      const resumeExists = await storage.exists(draft.resume.filePath);
      if (!resumeExists) {
        throw new Error(`Resume file not found at ${draft.resume.filePath}`);
      }
      pdfBuffer = await storage.readFile(draft.resume.filePath);
      contentType = draft.resume.mimeType || "application/pdf";

      if (draft.resume.fileName && draft.resume.fileName !== "ATS_Optimized_Resume.pdf" && draft.resume.fileName !== "Resume.pdf") {
        attachmentFilename = draft.resume.fileName;
      } else if (draft.resume.extractedText) {
        attachmentFilename = getCandidateFilename(draft.resume.extractedText);
      } else if (profile.name) {
        const parts = profile.name.trim().split(/\s+/).slice(0, 3);
        attachmentFilename = `Resume_${parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join("_")}.pdf`;
      }
    }

    // 6. Build MIME message with dynamic attachment header
    const raw = buildMimeMessage({
      from: `=?UTF-8?B?${Buffer.from(profile.name.replace(/[\r\n]/g, " ")).toString("base64")}?= <${senderEmail}>`,
      to: draft.recipientEmail,
      subject: draft.subject,
      body: draft.body,
      ...(pdfBuffer
        ? {
            attachment: {
              filename: attachmentFilename,
              content: pdfBuffer,
              contentType,
            },
            attachments: [
              {
                filename: attachmentFilename,
                content: pdfBuffer,
                contentType,
              },
            ],
          }
        : {}),
    });

    // 7. Send via Gmail API
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw },
    });

    const gmailMessageId = res.data.id || null;
    const gmailThreadId = res.data.threadId || null;

    // 8. Update attempt to SENT
    await prisma.sendAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "SENT",
        gmailMessageId,
        gmailThreadId,
      },
    });

    return {
      success: true,
      attemptId: attempt.id,
      gmailMessageId,
      recipientEmail: draft.recipientEmail,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("Failed to send email draft:", error);

    await prisma.sendAttempt.update({
      where: { id: attempt.id },
      data: {
        status: "FAILED",
        errorMessage: errorMsg,
      },
    });

    throw new Error(`Failed to send email: ${errorMsg}`);
  }
}

/**
 * Send a verification test email to verify Gmail OAuth sending persistence.
 */
export async function sendTestEmail(params: {
  userId: string;
  senderEmail?: string;
  targetEmail?: string;
}) {
  const { userId, senderEmail: requestedSender, targetEmail } = params;
  const { oauth2Client, senderEmail } = await getAuthenticatedClient(userId, requestedSender);
  const recipient = targetEmail || senderEmail;

  const subject = `[ApplyPilot Test] Gmail OAuth Verified for ${userId.toUpperCase()}`;
  const body = `Hello,\n\nThis is a verification test email sent from ApplyPilot at ${new Date().toISOString()}.\n\n` +
    `Connected Account: ${senderEmail}\n` +
    `User ID: ${userId}\n` +
    `Status: Gmail API OAuth sending is operational and persisted.\n\n` +
    `Note on Token Expiry:\n` +
    `In Google Cloud Testing mode, refresh tokens expire after 7 days unless the app is published or configured in Internal mode in Google Cloud Console.\n\n` +
    `Best regards,\nApplyPilot Automated System`;

  const raw = buildMimeMessage({
    from: senderEmail,
    to: recipient,
    subject,
    body,
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });

  return {
    success: true,
    messageId: res.data.id,
    threadId: res.data.threadId,
    senderEmail,
    recipientEmail: recipient,
  };
}
