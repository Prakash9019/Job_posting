import { put, get, del, head } from "@vercel/blob";
import type { StorageProvider } from "./types";

export class BlobStorageProvider implements StorageProvider {
  async saveFile(key: string, buffer: Buffer, mimeType: string) {
    await put(key, buffer, { access: "private", addRandomSuffix: false, contentType: mimeType });
    return key;
  }
  async readFile(key: string) {
    const result = await get(key, { access: "private", useCache: false });
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
