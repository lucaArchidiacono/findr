import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { access, mkdir, readFile as fsReadFile, writeFile as fsWriteFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import type { SearchResult } from "./plugins";

const CACHE_FILE_VERSION = 1;
const CACHE_FILENAME = "search-cache.json";
const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours

const getEnvValue = (key: string): string | undefined => {
  if (typeof Bun !== "undefined" && Bun.env) {
    const value = Bun.env[key];
    if (value) {
      return value;
    }
  }

  if (typeof process !== "undefined" && "env" in process) {
    const value = process.env[key];
    if (value) {
      return value;
    }
  }

  return undefined;
};

const parsePositiveInteger = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const resolveCacheFilePath = (explicitPath?: string): string => {
  if (explicitPath) {
    return explicitPath;
  }

  const overriddenPath = getEnvValue("FINDR_CACHE_FILE");
  if (overriddenPath) {
    return overriddenPath;
  }

  const overriddenDir = getEnvValue("FINDR_CACHE_DIR");
  if (overriddenDir) {
    return join(overriddenDir, CACHE_FILENAME);
  }

  const home = typeof homedir === "function" ? homedir() : undefined;
  if (!home) {
    return join(".", ".findr", CACHE_FILENAME);
  }

  const platform = typeof process !== "undefined" ? process.platform : undefined;
  if (platform === "darwin") {
    return join(home, "Library", "Caches", "findr", CACHE_FILENAME);
  }
  if (platform === "win32") {
    const localAppData =
      getEnvValue("LOCALAPPDATA") ?? join(home, "AppData", "Local");
    return join(localAppData, "findr", "Cache", CACHE_FILENAME);
  }
  return join(home, ".cache", "findr", CACHE_FILENAME);
};

const resolveTtl = (configuredTtl?: number): number | undefined => {
  if (typeof configuredTtl === "number") {
    return configuredTtl >= 0 ? configuredTtl : undefined;
  }
  const envTtl = parsePositiveInteger(getEnvValue("FINDR_CACHE_TTL_MS"));
  if (typeof envTtl === "number") {
    return envTtl;
  }
  return DEFAULT_TTL_MS;
};

const cloneSerializable = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

interface CacheEntry {
  results: SearchResult[];
  cachedAt: number;
  expiresAt?: number;
}

interface CacheFileFormat {
  version: number;
  entries: Record<string, CacheEntry>;
}

export interface SearchCacheKey {
  pluginId: string;
  query: string;
  limit?: number;
}

export interface SearchCacheRecord extends SearchCacheKey {
  results: SearchResult[];
}

export interface SearchCacheOptions {
  path?: string;
  ttlMs?: number;
}

const bunAvailable = (): boolean => typeof Bun !== "undefined";

const fileExists = async (path: string): Promise<boolean> => {
  if (bunAvailable()) {
    const file = Bun.file(path);
    return await file.exists();
  }
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const readTextFile = async (path: string): Promise<string> => {
  if (bunAvailable()) {
    return await Bun.file(path).text();
  }
  return await fsReadFile(path, "utf-8");
};

const writeTextFile = async (path: string, data: string): Promise<void> => {
  if (bunAvailable()) {
    await Bun.write(path, data, { createPath: true });
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await fsWriteFile(path, data, "utf-8");
};

export class SearchCache {
  private readonly path: string;
  private readonly ttlMs?: number;
  private readonly entries = new Map<string, CacheEntry>();
  private isLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(options: SearchCacheOptions = {}) {
    this.path = resolveCacheFilePath(options.path);
    this.ttlMs = resolveTtl(options.ttlMs);
  }

  async get(key: SearchCacheKey): Promise<SearchResult[] | undefined> {
    await this.ensureLoaded();
    const cacheKey = this.createKey(key);
    const entry = this.entries.get(cacheKey);
    if (!entry) {
      return undefined;
    }

    if (this.isExpired(entry)) {
      this.entries.delete(cacheKey);
      await this.persist();
      return undefined;
    }

    return cloneSerializable(entry.results);
  }

  async set(record: SearchCacheRecord): Promise<void> {
    await this.ensureLoaded();
    const cacheKey = this.createKey(record);

    const now = Date.now();
    const expiresAt =
      typeof this.ttlMs === "number" && this.ttlMs > 0 ? now + this.ttlMs : undefined;

    this.entries.set(cacheKey, {
      results: cloneSerializable(record.results),
      cachedAt: now,
      expiresAt,
    });

    await this.persist();
  }

  private createKey(key: SearchCacheKey): string {
    return JSON.stringify([key.pluginId, key.limit ?? null, key.query]);
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
      const parsed = JSON.parse(serialized) as CacheFileFormat;

      if (parsed && parsed.version === CACHE_FILE_VERSION && parsed.entries) {
        for (const [key, entry] of Object.entries(parsed.entries)) {
          if (
            entry &&
            Array.isArray(entry.results) &&
            typeof entry.cachedAt === "number"
          ) {
            this.entries.set(key, {
              results: entry.results,
              cachedAt: entry.cachedAt,
              expiresAt: entry.expiresAt,
            });
          }
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn("Failed to load search cache:", error);
    }

    if (this.pruneExpiredEntries()) {
      await this.persist();
    }
  }

  private isExpired(entry: CacheEntry): boolean {
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
    const payload: CacheFileFormat = {
      version: CACHE_FILE_VERSION,
      entries: Object.fromEntries(this.entries.entries()),
    };

    const serialized = JSON.stringify(payload, null, 2);
    await writeTextFile(this.path, serialized);
  }
}

export default SearchCache;
