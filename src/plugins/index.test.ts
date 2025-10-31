import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { builtInPluginIds, createPluginManager } from ".";

describe("built-in plugin registration", () => {
  const originalBun = (globalThis as unknown as { Bun?: unknown }).Bun;

  beforeAll(() => {
    if (typeof (globalThis as Record<string, unknown>).Bun === "undefined") {
      (globalThis as Record<string, unknown>).Bun = { env: {} };
    }
  });

  afterAll(() => {
    if (typeof originalBun === "undefined") {
      delete (globalThis as Record<string, unknown>).Bun;
    } else {
      (globalThis as Record<string, unknown>).Bun = originalBun;
    }
  });

  it("registers the ChatGPT plugin and leaves it disabled by default", () => {
    const manager = createPluginManager();
    const chatgptRegistration = manager.getPlugin(builtInPluginIds.chatgpt);

    expect(chatgptRegistration).toBeDefined();
    expect(chatgptRegistration?.plugin.displayName).toBe("ChatGPT");
    expect(chatgptRegistration?.enabled).toBe(false);
  });
});
