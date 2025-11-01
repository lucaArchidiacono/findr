import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "bun:test";
import { KeyValueStorage } from "./keyValueStorage";

const createTempCache = async (filename = "cache.json") => {
  const dir = await mkdtemp(join(tmpdir(), "findr-kv-"));
  const path = join(dir, filename);
  return {
    dir,
    path,
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
};

describe("KeyValueStorage", () => {
  it("stores and retrieves values by string key", async () => {
    const temp = await createTempCache();
    const storage = new KeyValueStorage<string, { count: number }>({
      path: temp.path,
    });

    try {
      await storage.set("visits", { count: 3 });
      const result = await storage.get("visits");
      expect(result).toEqual({ count: 3 });
    } finally {
      await temp.cleanup();
    }
  });

  it("persists values to disk between instances", async () => {
    const temp = await createTempCache();
    const first = new KeyValueStorage<string, string>({ path: temp.path });

    try {
      await first.set("token", "abc123");

      const second = new KeyValueStorage<string, string>({ path: temp.path });
      await expect(second.get("token")).resolves.toBe("abc123");

      const serialized = await readFile(temp.path, "utf-8");
      expect(serialized).toContain("abc123");
    } finally {
      await temp.cleanup();
    }
  });

  it("expires values after the configured TTL", async () => {
    const temp = await createTempCache();
    const ttlMs = 10;
    const storage = new KeyValueStorage<string, string>({
      path: temp.path,
      ttlMs,
    });

    try {
      await storage.set("session", "live");
      await expect(storage.get("session")).resolves.toBe("live");

      await new Promise((resolve) => setTimeout(resolve, ttlMs + 10));
      await expect(storage.get("session")).resolves.toBeUndefined();
    } finally {
      await temp.cleanup();
    }
  });
});
