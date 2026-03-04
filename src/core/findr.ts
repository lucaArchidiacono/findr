import { homedir } from "os";
import { join } from "path";
import { pathToFileURL } from "url";

// ---- Types ----

/**
 * Raw result returned by a plugin's search function.
 */
export interface PluginResult {
  title: string;
  description: string;
  url: string;
  score?: number;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated search result with plugin attribution.
 * This is what the UI consumes.
 */
export interface SearchResult extends PluginResult {
  id: string;
  pluginIds: string[];
  pluginDisplayNames: string[];
  receivedAt: number;
}

/**
 * Error from a plugin during search.
 */
export interface PluginSearchError {
  pluginId: string;
  pluginDisplayName: string;
  error: Error;
}

/**
 * Snapshot of search state yielded to consumers.
 */
export interface SearchResponse {
  results: SearchResult[];
  errors: PluginSearchError[];
}

export type SortOrder = "relevance" | "recency" | "source";

/**
 * What plugin authors provide. Slim: a name and a search function.
 * User plugins in ~/.config/findr just export this shape.
 */
export interface PluginDef {
  name: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
  apiKeyEnv?: string;
  search: (query: string, signal: AbortSignal) => Promise<PluginResult[]>;
}

/**
 * Plugin info exposed to consumers (no search function).
 */
export interface PluginInfo {
  name: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  source: "builtin" | "user";
  apiKeyEnv?: string;
}

// ---- Internal types ----

interface InternalPlugin {
  name: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  source: "builtin" | "user";
  apiKeyEnv?: string;
  search: (query: string, signal: AbortSignal) => Promise<PluginResult[]>;
}

// ---- Aggregation ----

function aggregate(
  batches: Map<string, { plugin: InternalPlugin; results: PluginResult[] }>,
): SearchResult[] {
  const byUrl = new Map<
    string,
    {
      first: PluginResult;
      plugins: InternalPlugin[];
      totalScore: number;
      hasScore: boolean;
    }
  >();

  for (const [, batch] of batches) {
    for (const result of batch.results) {
      const entry = byUrl.get(result.url);
      if (entry) {
        if (!entry.plugins.some((p) => p.name === batch.plugin.name)) {
          entry.plugins.push(batch.plugin);
        }
        if (typeof result.score === "number") {
          entry.hasScore = true;
          entry.totalScore += result.score;
        }
      } else {
        byUrl.set(result.url, {
          first: result,
          plugins: [batch.plugin],
          totalScore: typeof result.score === "number" ? result.score : 0,
          hasScore: typeof result.score === "number",
        });
      }
    }
  }

  const now = Date.now();
  let idx = 0;
  return Array.from(byUrl.values()).map((entry) => ({
    ...entry.first,
    ...(entry.hasScore ? { score: entry.totalScore } : {}),
    id: `${idx++}-${crypto.randomUUID()}`,
    pluginIds: entry.plugins.map((p) => p.name),
    pluginDisplayNames: entry.plugins.map((p) => p.displayName),
    receivedAt: now,
  }));
}

// ---- Sorting ----

function sortResults(results: SearchResult[], order: SortOrder): SearchResult[] {
  const score = (r: SearchResult) => (typeof r.score === "number" ? r.score : 0);
  const time = (r: SearchResult) => (typeof r.timestamp === "number" ? r.timestamp : r.receivedAt);

  const sorted = [...results];
  switch (order) {
    case "recency":
      return sorted.sort((a, b) => time(b) - time(a) || score(b) - score(a));
    case "source":
      return sorted.sort((a, b) => {
        const pc = b.pluginIds.length - a.pluginIds.length;
        if (pc !== 0) return pc;
        const byId = a.pluginIds.join(",").localeCompare(b.pluginIds.join(","));
        if (byId !== 0) return byId;
        return score(b) - score(a);
      });
    case "relevance":
    default:
      return sorted.sort((a, b) => {
        const pc = b.pluginIds.length - a.pluginIds.length;
        if (pc !== 0) return pc;
        const sc = score(b) - score(a);
        if (sc !== 0) return sc;
        return time(b) - time(a);
      });
  }
}

// ---- Findr namespace ----

export namespace Findr {
  const registry = new Map<string, InternalPlugin>();
  const subs = new Map<string, Set<(data: unknown) => void>>();
  let prefsFile = join(homedir(), ".config", "findr", "preferences.json");
  let secretsFile = join(homedir(), ".config", "findr", "secrets.json");

  // -- Pub/Sub --

  function emit(event: string, data?: unknown): void {
    const s = subs.get(event);
    if (!s) return;
    for (const fn of s) fn(data);
  }

  export function subscribe<T = unknown>(event: string, cb: (data: T) => void): () => void {
    let s = subs.get(event);
    if (!s) {
      s = new Set();
      subs.set(event, s);
    }
    s.add(cb as (data: unknown) => void);
    return () => {
      s!.delete(cb as (data: unknown) => void);
    };
  }

  // -- Registration --

  export function register(def: PluginDef, source: "builtin" | "user" = "builtin"): void {
    registry.set(def.name, {
      name: def.name,
      displayName: def.displayName ?? def.name,
      description: def.description,
      enabled: def.enabled ?? true,
      source,
      apiKeyEnv: def.apiKeyEnv,
      search: def.search,
    });
  }

  export async function loadUserPlugins(): Promise<void> {
    const dir = join(homedir(), ".config", "findr");
    const glob = new Bun.Glob("*.{js,ts}");

    try {
      for await (const file of glob.scan({ cwd: dir, absolute: true, dot: false })) {
        try {
          const mod = await import(pathToFileURL(file).href);
          const def = mod.default ?? mod;

          if (typeof def?.name === "string" && typeof def?.search === "function") {
            if (!registry.has(def.name)) {
              register(
                {
                  name: def.name,
                  displayName: def.displayName,
                  description: def.description,
                  enabled: def.enabled ?? true,
                  apiKeyEnv: def.apiKeyEnv,
                  search: def.search,
                },
                "user",
              );
            }
          }
        } catch {
          // Skip invalid plugin files
        }
      }
    } catch {
      // ~/.config/findr doesn't exist, that's fine
    }
  }

  // -- Preferences --

  export function setPrefsPath(path: string): void {
    prefsFile = path;
  }

  export async function savePreferences(): Promise<void> {
    const data = JSON.stringify({ enabledPlugins: enabledIds() }, null, 2);
    await Bun.write(prefsFile, data, { createPath: true });
  }

  export async function loadPreferences(): Promise<void> {
    try {
      const file = Bun.file(prefsFile);
      if (!(await file.exists())) return;
      const raw = await file.json();
      const saved = raw?.enabledPlugins;
      if (!Array.isArray(saved)) return;

      const desired = new Set(saved as string[]);
      for (const plugin of registry.values()) {
        plugin.enabled = desired.has(plugin.name);
      }
    } catch {
      // Missing or malformed file — use defaults
    }
  }

  // -- Secrets --

  export function setSecretsPath(path: string): void {
    secretsFile = path;
  }

  export async function loadSecrets(): Promise<void> {
    try {
      const file = Bun.file(secretsFile);
      if (!(await file.exists())) return;
      const raw = await file.json();
      const keys = raw?.apiKeys;
      if (typeof keys !== "object" || keys === null) return;

      for (const [envVar, value] of Object.entries(keys)) {
        if (typeof value === "string" && value.length > 0) {
          Bun.env[envVar] = value;
        }
      }
    } catch {
      // Missing or malformed file — skip
    }
  }

  export async function saveSecrets(): Promise<void> {
    const apiKeys: Record<string, string> = {};
    for (const plugin of registry.values()) {
      if (plugin.apiKeyEnv) {
        const value = Bun.env[plugin.apiKeyEnv];
        if (value) {
          apiKeys[plugin.apiKeyEnv] = value;
        }
      }
    }
    const data = JSON.stringify({ apiKeys }, null, 2);
    await Bun.write(secretsFile, data, { createPath: true });
  }

  export function setApiKey(envVarName: string, value: string): void {
    Bun.env[envVarName] = value;
    saveSecrets().catch(() => {});
  }

  export function getApiKey(envVarName: string): string | undefined {
    return Bun.env[envVarName];
  }

  // -- Plugin management --

  export function list(): PluginInfo[] {
    return Array.from(registry.values())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ name, displayName, description, enabled, source, apiKeyEnv }) => ({
        name,
        displayName,
        description,
        enabled,
        source,
        apiKeyEnv,
      }));
  }

  export function get(name: string): PluginInfo | undefined {
    const p = registry.get(name);
    if (!p) return undefined;
    return {
      name: p.name,
      displayName: p.displayName,
      description: p.description,
      enabled: p.enabled,
      source: p.source,
      apiKeyEnv: p.apiKeyEnv,
    };
  }

  export function enable(name: string): void {
    const p = registry.get(name);
    if (!p) throw new Error(`Unknown plugin: ${name}`);
    p.enabled = true;
    savePreferences().catch(() => {});
  }

  export function disable(name: string): void {
    const p = registry.get(name);
    if (!p) throw new Error(`Unknown plugin: ${name}`);
    p.enabled = false;
    savePreferences().catch(() => {});
  }

  export function toggle(name: string): boolean {
    const p = registry.get(name);
    if (!p) throw new Error(`Unknown plugin: ${name}`);
    p.enabled = !p.enabled;
    savePreferences().catch(() => {});
    return p.enabled;
  }

  export function enabledIds(): string[] {
    return Array.from(registry.values())
      .filter((p) => p.enabled)
      .map((p) => p.name);
  }

  // -- Search --

  export async function* search(
    query: string,
    options: { signal?: AbortSignal; sortOrder?: SortOrder } = {},
  ): AsyncGenerator<SearchResponse, void, void> {
    const { signal, sortOrder = "relevance" } = options;
    const enabled = Array.from(registry.values()).filter((p) => p.enabled);

    if (enabled.length === 0) return;

    const abortController = new AbortController();
    const onExternalAbort = () => abortController.abort(signal?.reason);
    signal?.addEventListener("abort", onExternalAbort);

    const batches = new Map<string, { plugin: InternalPlugin; results: PluginResult[] }>();
    const errors: PluginSearchError[] = [];

    try {
      const tasks = enabled.map((plugin, index) =>
        plugin.search(query, abortController.signal).then(
          (results) => ({ status: "ok" as const, index, results }),
          (err: unknown) => ({ status: "err" as const, index, err }),
        ),
      );

      const pending = new Set(tasks);

      while (pending.size > 0) {
        const settled = await Promise.race(pending);
        pending.delete(tasks[settled.index]!);

        const plugin = enabled[settled.index]!;

        if (settled.status === "ok") {
          batches.set(plugin.name, {
            plugin,
            results: Array.isArray(settled.results) ? settled.results : [],
          });
        } else {
          const error =
            settled.err instanceof Error ? settled.err : new Error(String(settled.err));

          const pluginError: PluginSearchError = {
            pluginId: plugin.name,
            pluginDisplayName: plugin.displayName,
            error,
          };
          errors.push(pluginError);
          emit("search:error", pluginError);
        }

        const aggregated = aggregate(batches);
        const sorted = sortResults(aggregated, sortOrder);
        const snapshot: SearchResponse = { results: sorted, errors: [...errors] };

        emit("search:batch", snapshot);
        yield snapshot;
      }

      emit("search:done", undefined);
    } finally {
      signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  // -- Testing --

  export function clear(): void {
    registry.clear();
    subs.clear();
  }
}
