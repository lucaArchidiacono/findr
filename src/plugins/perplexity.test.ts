import { describe, expect, it } from "bun:test";
import perplexityPlugin from "./perplexity";

const signal = () => new AbortController().signal;

describe("perplexity plugin", () => {
  it("has correct metadata", () => {
    expect(perplexityPlugin.name).toBe("perplexity");
    expect(perplexityPlugin.displayName).toBe("Perplexity");
    expect(perplexityPlugin.enabled).toBe(false);
  });

  it("throws when PERPLEXITY_API_KEY is missing", async () => {
    const original = Bun.env["PERPLEXITY_API_KEY"];
    delete Bun.env["PERPLEXITY_API_KEY"];
    try {
      await expect(perplexityPlugin.search("test", signal())).rejects.toThrow(
        "Missing Perplexity API key",
      );
    } finally {
      if (original) Bun.env["PERPLEXITY_API_KEY"] = original;
    }
  });

  it("returns empty when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await perplexityPlugin.search("test", controller.signal);
    expect(results).toHaveLength(0);
  });
});
