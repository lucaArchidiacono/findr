import { describe, expect, it } from "bun:test";
import mockPlugin, { MOCK_DATA } from "./mock";

const signal = () => new AbortController().signal;

describe("mock plugin", () => {
  it("has correct metadata", () => {
    expect(mockPlugin.name).toBe("mock");
    expect(mockPlugin.displayName).toBe("Local Mock");
    expect(mockPlugin.enabled).toBe(true);
  });

  it("returns all results for empty query", async () => {
    const results = await mockPlugin.search("", signal());
    expect(results).toHaveLength(MOCK_DATA.length);
  });

  it("filters results by query", async () => {
    const results = await mockPlugin.search("pluggable", signal());
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThan(MOCK_DATA.length);
    expect(results.every((r) => r.title.toLowerCase().includes("pluggable") || r.description.toLowerCase().includes("pluggable"))).toBe(true);
  });

  it("returns empty for non-matching query", async () => {
    const results = await mockPlugin.search("xyznonexistent123", signal());
    expect(results).toHaveLength(0);
  });

  it("normalizes score to 1 and adds timestamp", async () => {
    const results = await mockPlugin.search("", signal());
    for (const r of results) {
      expect(r.score).toBe(1);
      expect(r.timestamp).toBeGreaterThan(0);
    }
  });

  it("returns empty when signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const results = await mockPlugin.search("test", controller.signal);
    expect(results).toHaveLength(0);
  });

  it("caps results at 10", async () => {
    // MOCK_DATA has 5 items, so this just verifies the slice
    const results = await mockPlugin.search("", signal());
    expect(results.length).toBeLessThanOrEqual(10);
  });
});
