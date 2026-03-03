import type { PluginDef } from "../core/findr";

const perplexityPlugin: PluginDef = {
  name: "perplexity",
  displayName: "Perplexity",
  description:
    "Uses Vercel AI SDK with Zod schema to fetch structured web results (requires PERPLEXITY_API_KEY).",
  enabled: false,
  search: async (query, signal) => {
    if (signal.aborted) return [];

    const apiKey = Bun.env["PERPLEXITY_API_KEY"];
    if (!apiKey) {
      throw new Error(
        "Missing Perplexity API key. Set PERPLEXITY_API_KEY=... to enable the plugin.",
      );
    }

    const { z } = await import("zod");
    const { generateObject } = await import("ai");
    const { createPerplexity } = await import("@ai-sdk/perplexity");

    const limit = 10;

    const schema = z.object({
      results: z
        .array(
          z.object({
            title: z.string().min(1),
            url: z.string().url(),
            description: z.string().default(""),
            publishedAt: z.string().optional(),
            score: z.number().optional(),
          }),
        )
        .min(0)
        .max(limit),
    });

    const perplexity = createPerplexity({ apiKey });

    const { object } = await generateObject({
      model: perplexity("sonar"),
      messages: [
        {
          role: "system",
          content:
            "You are a web search assistant. Provide web results as structured JSON matching the schema.",
        },
        {
          role: "user",
          content: `Query: ${query}\nReturn up to ${limit} results. Focus on relevant, high quality sources.`,
        },
      ],
      schema,
      abortSignal: signal,
    });

    return (object.results ?? []).slice(0, limit).map((item, idx) => ({
      id: `perplexity-${idx}`,
      title: item.title,
      description: item.description ?? "",
      url: item.url,
      score: typeof item.score === "number" ? item.score : undefined,
      timestamp: item.publishedAt ? Date.parse(item.publishedAt) : undefined,
    }));
  },
};

export default perplexityPlugin;
