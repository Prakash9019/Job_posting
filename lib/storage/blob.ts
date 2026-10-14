import { put, get, del, head } from "@vercel/blob";
import type { StorageProvider } from "./types";

export class BlobStorageProvider implements StorageProvider {
  private get access(): "public" | "private" {
    return (process.env.BLOB_ACCESS_TYPE as "public" | "private") || "public";
  }

  async saveFile(key: string, buffer: Buffer, mimeType: string) {
    await put(key, buffer, { access: this.access, addRandomSuffix: false, contentType: mimeType });
    return key;
  }
  async readFile(key: string) {
    const result = await get(key, { access: this.access, useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) throw new Error("Stored file not found.");
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  }
  async deleteFile(key: string) { await del(key); }
  async exists(key: string) {
    try { await head(key); return true; } catch (error) {
      if (error instanceof Error && /not found|does not exist/i.test(error.message)) return false;
      throw error;
    }
  }
}
