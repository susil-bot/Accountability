export interface ObjectInfo {
  size: number;
}

/** Private object storage used for evidence files. Bytes go straight between the browser and storage. */
export interface StorageDriver {
  /** URL the browser PUTs the file to. Valid for `expiresSec`. */
  presignPut(key: string, contentType: string, expiresSec: number): Promise<string>;
  /** Short-lived URL to view or download a private object. */
  presignGet(key: string, expiresSec: number, opts?: { filename?: string; contentType?: string }): Promise<string>;
  head(key: string): Promise<ObjectInfo | null>;
  /** First `bytes` bytes of the object (for content sniffing), or null if missing. */
  readStart(key: string, bytes: number): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export const STORAGE_DRIVER = Symbol('STORAGE_DRIVER');

/** ev/<user uuid>/<48 hex>[.thumb].<ext> — random, opaque, never derived from user input. */
export const KEY_PATTERN = /^ev\/[0-9a-f-]{36}\/[a-f0-9]{48}(\.thumb)?\.(webp|jpg|png|pdf)$/;
