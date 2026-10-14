/**
 * Database Migration Script: Rotate Encryption Key
 * Decrypts all GmailAccount tokens with OLD_ENCRYPTION_SECRET (or current key)
 * and re-encrypts them with the new ENCRYPTION_SECRET.
 *
 * Usage:
 * npx tsx scripts/migrate-encryption-key.ts
 */

import { prisma } from "../lib/db/prisma";
import { encrypt, decrypt } from "../lib/security/encryption";

async function main() {
  console.log("🔐 Starting Encryption Key Migration for ApplyPilot...");

  const currentSecret = process.env.ENCRYPTION_SECRET;
  const oldSecret = process.env.OLD_ENCRYPTION_SECRET;

  if (!currentSecret) {
    console.error("❌ ENCRYPTION_SECRET is not set in environment.");
    process.exit(1);
  }

  console.log(`Current Key: ${currentSecret.substring(0, 8)}... (Length: ${currentSecret.length})`);
  if (oldSecret) {
    console.log(`Fallback/Old Key: ${oldSecret.substring(0, 8)}... (Length: ${oldSecret.length})`);
  } else {
    console.log("ℹ️ No OLD_ENCRYPTION_SECRET specified. Will verify and re-encrypt using current key.");
  }

  const accounts = await prisma.gmailAccount.findMany();
  console.log(`Found ${accounts.length} Gmail account(s) to verify/migrate.`);

  let migratedCount = 0;
  let alreadyUpToDateCount = 0;

  for (const account of accounts) {
    try {
      // 1. Try decrypting access token with current key first
      let accessDecrypted: string;
      let refreshDecrypted: string | null = null;
      let needsReEncryption = false;

      try {
        accessDecrypted = decrypt(account.accessTokenEncrypted, currentSecret);
        if (account.refreshTokenEncrypted) {
          refreshDecrypted = decrypt(account.refreshTokenEncrypted, currentSecret);
        }
        // If it succeeded with current key and no old secret was used, verify format
        alreadyUpToDateCount++;
      } catch {
        // Current key failed, try old secret if available
        if (!oldSecret) {
          throw new Error(`Cannot decrypt account ${account.email} with current key and no OLD_ENCRYPTION_SECRET provided.`);
        }
        accessDecrypted = decrypt(account.accessTokenEncrypted, oldSecret);
        if (account.refreshTokenEncrypted) {
          refreshDecrypted = decrypt(account.refreshTokenEncrypted, oldSecret);
        }
        needsReEncryption = true;
      }

      if (needsReEncryption) {
        const newEncryptedAccess = encrypt(accessDecrypted, currentSecret);
        const newEncryptedRefresh = refreshDecrypted
          ? encrypt(refreshDecrypted, currentSecret)
          : null;

        await prisma.gmailAccount.update({
          where: { id: account.id },
          data: {
            accessTokenEncrypted: newEncryptedAccess,
            refreshTokenEncrypted: newEncryptedRefresh,
          },
        });

        console.log(`✅ Successfully re-encrypted tokens for account: ${account.email} (${account.userId})`);
        migratedCount++;
      }
    } catch (err) {
      console.error(`❌ Failed to migrate account ${account.email} (${account.userId}):`, err);
    }
  }

  console.log("\n--- Migration Summary ---");
  console.log(`Total accounts: ${accounts.length}`);
  console.log(`Migrated to new key: ${migratedCount}`);
  console.log(`Already encrypted with new key: ${alreadyUpToDateCount}`);
  console.log("Migration complete.\n");
}

main()
  .catch((err) => {
    console.error("Migration fatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
