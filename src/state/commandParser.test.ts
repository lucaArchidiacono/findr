import { describe, expect, it } from "vitest";
import { parseInput } from "./commandParser";

describe("command parser", () => {
  it("treats plain input as search query", () => {
    const parsed = parseInput("hello world");
    expect(parsed).toEqual({ type: "search", query: "hello world" });
  });

  it("detects empty input", () => {
    const parsed = parseInput("   ");
    expect(parsed).toEqual({ type: "empty" });
  });

  it("parses plugin toggle commands", () => {
    const parsed = parseInput(":enable brave");
    expect(parsed).toEqual({
      type: "command",
      command: { kind: "enablePlugin", pluginId: "brave" },
    });
  });

  it("parses sort command aliases", () => {
    const parsed = parseInput(":sort recency");
    expect(parsed).toEqual({
      type: "command",
      command: { kind: "setSort", sortOrder: "recency" },
    });
  });

  it("flags unknown commands", () => {
    const parsed = parseInput(":unknown stuff");
    expect(parsed.type).toBe("error");
  });

  it("handles help alias", () => {
    const parsed = parseInput(":?");
    expect(parsed).toEqual({
      type: "command",
      command: { kind: "showHelp" },
    });
  });
});
