import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/** Original files are immutable: they are written once and never changed. */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
}

class LocalDiskStorage implements FileStorage {
  constructor(private root: string) {}
  private resolve(key: string) {
    const root = path.resolve(this.root);
    const p = path.resolve(root, key);
    if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
    return p;
  }
  async put(key: string, data: Buffer) {
    const p = this.resolve(key);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, data, { flag: "wx" }); // never overwrite an original
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
}

// S3-compatible storage (e.g. Cloudflare R2) plugs in here behind the same interface.
export const storage: FileStorage = new LocalDiskStorage(process.env.FILES_DIR ?? "./storage");
