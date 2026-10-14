import fs from "fs/promises";
import path from "path";
import { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir?: string) {
    const rawDir = baseDir || process.env.UPLOAD_DIR || "./uploads";
    this.baseDir = path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawDir);
  }

  private resolveSafePath(key: string): string {
    // Prevent path traversal
    const safeKey = key.replace(/^(\.\.[\/\\])+/, "").replace(/[\\\/]+/g, path.sep);
    const resolved = path.resolve(this.baseDir, safeKey);
    if (!resolved.startsWith(this.baseDir)) {
      throw new Error(`Security Violation: Path traversal detected for key ${key}`);
    }
    return resolved;
  }

  async saveFile(key: string, buffer: Buffer, mimeType: string): Promise<string> {
    void mimeType;
    const filePath = this.resolveSafePath(key);
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, buffer);
    return key;
  }

  async readFile(key: string): Promise<Buffer> {
    const filePath = this.resolveSafePath(key);
    return await fs.readFile(filePath);
  }

  async deleteFile(key: string): Promise<void> {
    try {
      const filePath = this.resolveSafePath(key);
      await fs.unlink(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const filePath = this.resolveSafePath(key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getAbsolutePath(key: string): string {
    return this.resolveSafePath(key);
  }
}
