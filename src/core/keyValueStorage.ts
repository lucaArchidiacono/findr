import { join } from "node:path";
import { tmpdir } from "node:os";

const CACHE_FILE_VERSION = 1;
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const resolveCacheFilePath = ({
  filename,
  explicitPath,
}: {
  filename?: string;
  explicitPath?: string;
}): string => {
  if (explicitPath) {
    return explicitPath;
  }

  const resolvedFilename = filename ?? "findr-cache.json";

  const overriddenPath = Bun.env["FINDR_CACHE_FILE"];
  if (overriddenPath) {
    return overriddenPath;
  }

  const overriddenDir = Bun.env["FINDR_CACHE_DIR"];
  if (overriddenDir) {
    return join(overriddenDir, resolvedFilename);
  }

  const tmp = typeof tmpdir === "function" ? tmpdir() : undefined;
  if (!tmp) {
    return join(".", ".findr", resolvedFilename);
  }

  return join(tmp, "findr", resolvedFilename);
};

const resolveTtl = (configuredTtl?: number): number | undefined => {
  if (typeof configuredTtl === "number") {
    return configuredTtl >= 0 ? configuredTtl : undefined;
  }
  const envTtl = parsePositiveInteger(Bun.env["FINDR_CACHE_TTL_MS"]);
  if (typeof envTtl === "number") {
    return envTtl;
  }
  return DEFAULT_TTL_MS;
};

interface CacheEntry<TValue> {
  value: TValue;
  cachedAt: number;
  expiresAt?: number;
}

interface CacheFileFormat<TValue> {
  version: number;
  entries: Record<string, CacheEntry<TValue>>;
}

const defaultSerializeKey = (key: unknown): string => {
  if (typeof key === "string") {
    return key;
  }

  try {
    return JSON.stringify(key);
  } catch {
    return String(key);
  }
};

export interface KeyValueStorageOptions<TKey = string> {
  filename?: string;
  path?: string;
  ttlMs?: number;
  serializeKey?: (key: TKey) => string;
}

const fileExists = async (path: string): Promise<boolean> => {
  const file = Bun.file(path);
  return await file.exists();
};

const readTextFile = async (path: string): Promise<string> => {
  return await Bun.file(path).text();
};

const writeTextFile = async (path: string, data: string): Promise<void> => {
  await Bun.write(path, data, { createPath: true });
};

export class KeyValueStorage<TKey = string, TValue = unknown> {
  private readonly path: string;
  private readonly ttlMs?: number;
  private readonly serializeKey: (key: TKey) => string;
  private readonly entries = new Map<string, CacheEntry<TValue>>();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: KeyValueStorageOptions<TKey>) {
    this.path = resolveCacheFilePath({ filename: options.filename, explicitPath: options.path });
    this.ttlMs = resolveTtl(options.ttlMs);
    this.serializeKey = options.serializeKey ?? ((key) => defaultSerializeKey(key));
  }

  async get(key: TKey): Promise<TValue | undefined> {
    await this.ensureLoaded();
    const serializedKey = this.serializeKey(key);
    const entry = this.entries.get(serializedKey);
    if (!entry) {
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.entries.delete(serializedKey);
      await this.persist();
      return undefined;
    }

    return entry.value;
  }

  async set(key: TKey, value: TValue): Promise<void> {
    await this.ensureLoaded();

    const now = Date.now();
    const expiresAt =
      typeof this.ttlMs === "number" && this.ttlMs > 0 ? now + this.ttlMs : undefined;

    const serializedKey = this.serializeKey(key);

    this.entries.set(serializedKey, {
      value,
      cachedAt: now,
      expiresAt,
    });

    await this.persist();
  }

  private async ensureLoaded(): Promise<void> {
    if (this.isLoaded) {
      return;
    }
    if (!this.loadPromise) {
      this.loadPromise = this.loadFromDisk().finally(() => {
        this.isLoaded = true;
        this.loadPromise = null;
      });
    }
    await this.loadPromise;
  }

  private async loadFromDisk(): Promise<void> {
    const exists = await fileExists(this.path);
    if (!exists) {
      return;
    }

    try {
      const serialized = await readTextFile(this.path);
      const parsed = JSON.parse(serialized) as CacheFileFormat<unknown>;

      if (parsed && parsed.version === CACHE_FILE_VERSION && parsed.entries) {
        for (const [key, entry] of Object.entries(parsed.entries)) {
          if (!entry || typeof entry.cachedAt !== "number") {
            continue;
          }

          this.entries.set(key, {
            value: entry.value as TValue,
            cachedAt: entry.cachedAt,
            expiresAt: entry.expiresAt,
          });
        }
      }
    } catch (error) {
      console.warn("Failed to load search cache:", error);
    }

    if (this.pruneExpiredEntries()) {
      await this.persist();
    }
  }

  private isExpired(entry: CacheEntry<TValue>): boolean {
    const now = Date.now();
    if (typeof entry.expiresAt === "number") {
      return entry.expiresAt <= now;
    }
    if (typeof this.ttlMs === "number" && this.ttlMs > 0) {
      return entry.cachedAt + this.ttlMs <= now;
    }
    return false;
  }

  private pruneExpiredEntries(): boolean {
    let changed = false;
    for (const [key, entry] of this.entries.entries()) {
      if (this.isExpired(entry)) {
        this.entries.delete(key);
        changed = true;
      }
    }
    return changed;
  }

  private async persist(): Promise<void> {
    const writeTask = this.writeChain.then(() => this.writeToDisk());
    this.writeChain = writeTask.catch((error) => {
      this.writeChain = Promise.resolve();
      throw error;
    });
    await writeTask;
  }

  private async writeToDisk(): Promise<void> {
    const payload: CacheFileFormat<TValue> = {
      version: CACHE_FILE_VERSION,
      entries: Object.fromEntries(this.entries.entries()),
    };

    const serialized = JSON.stringify(payload, null, 2);
    await writeTextFile(this.path, serialized);
  }
}

export default KeyValueStorage;
