# Findr

Terminal UI meta-search client built with React/OpenTUI on Bun. Aggregates results from multiple search plugins with streaming, deduplication, and sorting.

## Commands

```bash
bun run dev          # Start with hot reload (DEBUG=true)
bun test             # Run all tests
bun test src/core    # Run specific directory
npx tsc --noEmit     # Type check
bun run lint         # ESLint
bun run format       # Prettier check
```

## Architecture

```
src/
├── core/findr.ts          # Backend: plugin registry, search, pub/sub, preferences
├── plugins/               # One file per builtin plugin (mock, brave, duckduckgo, perplexity)
│   └── builtin.ts         # Registers all builtin plugins
├── components/            # React/OpenTUI UI (App, SearchBar, ResultList, PluginPanel, StatusBar, FeedbackBar)
├── state/                 # appState reducer + commandParser
├── plugin/index.ts        # Type re-exports for plugin authors
└── index.tsx              # Entry point
```

**Findr namespace** (`src/core/findr.ts`) is the entire backend. No separate files for bus, loader, or cache. It provides:
- `Findr.register(def)` / `Findr.loadUserPlugins()` — plugin registration
- `Findr.search(query, opts)` — async generator yielding `SearchResponse` as plugins complete
- `Findr.subscribe(event, cb)` — pub/sub (`search:batch`, `search:error`, `search:done`)
- `Findr.enable/disable/toggle/enabledIds/list/get` — plugin management
- `Findr.savePreferences/loadPreferences` — persists to `~/.config/findr/preferences.json`

**Plugin definition** is intentionally slim:
```ts
{ name: string, search: (query: string, signal: AbortSignal) => Promise<PluginResult[]> }
```
Optional fields: `displayName`, `description`, `enabled`. User plugins go in `~/.config/findr/*.{js,ts}`.

## Conventions

- **Bun runtime** — use `Bun.file()`, `Bun.write()`, `Bun.env`, `Bun.Glob` instead of Node equivalents
- **bun:test** — tests use `import { describe, expect, it } from "bun:test"` with `spyOn` for mocks
- **Test files** live next to source: `foo.ts` → `foo.test.ts`
- **Plugins export a default `PluginDef`** and optionally export parse functions for testability (e.g., `parseBraveResults`, `parseDDGResults`)
- **No classes in core** — `Findr` is a namespace with module-scoped state
- **Frontend is pure React** with a reducer (`appState.ts`) — no external state library
- **TypeScript strict mode** via `@tsconfig/bun`; JSX runtime is `@opentui/react`
- **Formatting**: double quotes, semicolons, 100 char width, trailing commas

## Key types

| Type | Location | Used by |
|------|----------|---------|
| `SearchResult` | `core/findr.ts` | UI components — has `id`, `pluginIds`, `pluginDisplayNames`, `receivedAt` |
| `PluginResult` | `core/findr.ts` | Plugin search functions — raw result without aggregation fields |
| `SearchResponse` | `core/findr.ts` | `{ results: SearchResult[], errors: PluginSearchError[] }` |
| `PluginDef` | `core/findr.ts` | What plugins export |
| `SortOrder` | `core/findr.ts` | `"relevance" \| "recency" \| "source"` |

## Environment variables

- `BRAVE_API_KEY` — required for Brave plugin
- `PERPLEXITY_API_KEY` — required for Perplexity plugin
- `DEBUG=true` — enables OpenTUI debug console
