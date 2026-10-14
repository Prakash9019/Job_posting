export interface StoredFile {
  key: string;            // relative path or object key
  originalName: string;
  size: number;
  mimeType: string;
  url?: string;
}

export interface StorageProvider {
  /**
   * Save a file buffer to storage.
   * @param key Relative path or filename identifier
   * @param buffer Content buffer
   * @param mimeType Content MIME type
   */
  saveFile(key: string, buffer: Buffer, mimeType: string): Promise<string>;

  /**
   * Read a file buffer from storage.
   * @param key Relative path or storage key
   */
  readFile(key: string): Promise<Buffer>;

  /**
   * Delete a file from storage.
   * @param key Relative path or storage key
   */
  deleteFile(key: string): Promise<void>;

  /**
   * Check if a file exists.
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get absolute or local path (if local provider)
   */
  getAbsolutePath?(key: string): string;
}
