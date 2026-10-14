import { StorageProvider } from "./types";
import { LocalStorageProvider } from "./local";
import { BlobStorageProvider } from "./blob";

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (instance) return instance;

  const providerType = (process.env.STORAGE_PROVIDER || "local").toLowerCase();
  if (process.env.VERCEL && providerType !== "blob") throw new Error("Configure STORAGE_PROVIDER=blob and a Vercel Blob store.");

  switch (providerType) {
    case "blob":
      instance = new BlobStorageProvider();
      break;
    case "local":
      instance = new LocalStorageProvider();
      break;
    case "s3":
      // Future cloud provider stub - ready for S3 SDK adapter
      throw new Error("S3 Storage provider configured but cloud adapter credentials not provided. Set STORAGE_PROVIDER=local for local execution.");
    default:
      instance = new LocalStorageProvider();
  }

  return instance;
}

export * from "./types";
export * from "./local";
