# Findr — Pluggable Search TUI

Findr is a terminal UI meta-search client built on top of OpenTUI. It exposes a flexible plugin
architecture so new providers can be added without touching the core UI.

## Getting Started

Install dependencies with Bun:

```bash
bun install
```

Start the TUI in watch mode:

```bash
bun run dev
```

## Quality Tooling

| Task       | Command                |
| ---------- | ---------------------- |
| Lint       | `bun run lint`         |
| Lint (fix) | `bun run lint:fix`     |
| Format     | `bun run format`       |
| Format fix | `bun run format:write` |
| Test       | `bun test`             |

Vitest covers the plugin manager, state reducer, and command parser so you can iterate confidently.

## UI Primer

- The bottom bar doubles as a search box and command prompt.
- Use `Tab` to cycle between panes (search input → results → plugin sidebar).
- Navigate results with arrow keys or `j/k`. Press `Enter` on a result to open it in your browser.
- When the plugin sidebar is focused, toggle plugins with `Space`.

### Inline Commands

Type commands directly into the input using a leading colon:

| Command             | Purpose                        |
| ------------------- | ------------------------------ | ------- | ---------------------- |
| `:enable <plugin>`  | Enable a provider              |
| `:disable <plugin>` | Disable a provider             |
| `:toggle <plugin>`  | Toggle a provider              |
| `:sort relevance    | recency                        | source` | Switch result ordering |
| `:plugins`          | Show/Hide the plugin sidebar   |
| `:clear`            | Clear the current results      |
| `:help`             | Show the built-in help summary |

## Plugin Development

Plugins implement the lightweight `SearchPlugin` interface located in `src/core/plugins.ts`.
Register new plugins in `src/plugins/index.ts`. Each plugin can opt into being enabled by default,
or remain opt-in for providers that require API keys.

The sample `mock` plugin shows the minimal shape required for testing without live credentials.
When integrating remote providers (Brave, Exa, Perplexity, etc.) prefer returning normalised
results (`title`, `description`, `url`, optional `score` and `timestamp`) so the UI can surface
them consistently.

### Built-in Plugins

- Local Mock (`:toggle mock`) — deterministic demo data and zero configuration.
- Brave Search (`:toggle brave`) — remote results via the Brave Search API. Supply `BRAVE_API_KEY`
  in your environment before enabling:

  ```bash
  export BRAVE_API_KEY="your-token-here"
  bun run dev
  ```
- Perplexity (`:toggle perplexity`) — structured web answers via Vercel AI SDK. Requires `PERPLEXITY_API_KEY`.
- ChatGPT (`:toggle chatgpt`) — uses OpenAI's ChatGPT models to synthesise web-style results. Requires `OPENAI_API_KEY`.
