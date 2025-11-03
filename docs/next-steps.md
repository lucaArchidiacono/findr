# Findr TUI — Follow-up Tasks & Context

This document captures the current state of the project, completed work, and suggested next steps so
future sessions can resume quickly.

## Current State

- **Core architecture** – `src/core/plugins.ts`, `src/core/backend.ts`: plugin contracts, lifecycle
  management, search orchestration, caching, and result sorting.
- **Plugins** – `src/plugins/index.ts`, `src/plugins/mock.ts`, `src/plugins/brave.ts`: plugin
  registry with a local mock provider and Brave Search integration (requires `BRAVE_API_KEY`).
- **State management** – `src/state/appState.ts`, `src/state/commandParser.ts`: reducer, pane
  tracking, command parsing, and feedback handling.
- **UI components** – `src/components/App.tsx` orchestrates SearchBar, ResultList, PluginPanel,
  StatusBar, and FeedbackBar to deliver the terminal UI workflow.
- **Tooling** – ESLint (flat config), Prettier (`prettier.config.mjs`), Vitest (`vitest.config.ts`),
  and scripts in `package.json` (`lint`, `lint:fix`, `format`, `format:write`, `test`).
- **Test coverage** – Vitest suites in `src/core/backend.test.ts`, `src/core/plugins.test.ts`,
  `src/state/appState.test.ts`, and `src/state/commandParser.test.ts` assert backend aggregation,
  caching, reducer behaviour, and command parsing.
- **Documentation** – `README.md` now covers setup, commands, keybindings, and plugin development.

## Quality Status

All checks as of this session:

```bash
bun run lint
bun run format
bun test
```

## Suggested Next Steps

1. **Integrate real providers** – add plugins (e.g. Exa, Perplexity, Meilisearch) that read
   credentials from `Bun.env`, normalise responses, and register them in `src/plugins/index.ts`.
2. **Persist preferences** – store enabled plugin ids and sort order on disk (`~/.findr.json`) and
   load them when the TUI starts, updating the reducer accordingly.
3. **Offline-friendly testing** – extend the mock plugin to simulate paginated results and latency,
   improving confidence in UI states (loading, empty, errors).
4. **Accessibility & UX polish** – add a help overlay, improve colour contrast, and expose keyboard
   shortcuts within the interface.
5. **Diagnostic logging** – surface plugin error details in a dedicated panel or file for easier
   debugging when remote APIs fail.

## Handy Paths

- Entry point: `src/index.tsx`
- Main UI: `src/components/App.tsx`
- Plugin contract: `src/core/plugins.ts`
- Command parser: `src/state/commandParser.ts`
- Tests: `src/core/backend.test.ts`, `src/core/plugins.test.ts`, `src/state/appState.test.ts`,
  `src/state/commandParser.test.ts`

Keep this file updated during further sessions to maintain continuity.
