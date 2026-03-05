# Findr

Terminal UI meta-search client built with OpenTUI. Aggregates results from multiple search plugins.

## Install

```bash
brew tap lucaArchidiacono/findr https://github.com/lucaArchidiacono/findr.git
brew install findr
```

Or run from source:

```bash
bun install
bun run dev
```

## Usage

- Type to search, results stream in from all enabled plugins.
- `Tab` to cycle panes (input / results / plugin sidebar).
- `j/k` or arrow keys to navigate results. `Enter` to open in browser.
- `Space` to toggle plugins when the sidebar is focused.

### Commands

| Command             | Purpose                |
| ------------------- | ---------------------- |
| `/enable <plugin>`  | Enable a provider      |
| `/disable <plugin>` | Disable a provider     |
| `/toggle <plugin>`  | Toggle a provider      |
| `/sort <order>`     | `relevance` / `recency` / `source` |
| `/plugins`          | Show/hide plugin sidebar |
| `/clear`            | Clear results          |
| `/help`             | Help summary           |

## Plugins

Built-in: **Brave Search**, **DuckDuckGo**, **Perplexity**.

Brave and Perplexity require API keys in `~/.config/findr/secrets.json`:

```json
{
  "BRAVE_API_KEY": "...",
  "PERPLEXITY_API_KEY": "..."
}
```

Custom plugins go in `~/.config/findr/*.{js,ts}` and export a default `PluginDef`.

## Development

| Task       | Command              |
| ---------- | -------------------- |
| Dev        | `bun run dev`        |
| Build      | `bun run build`      |
| Test       | `bun test`           |
| Lint       | `bun run lint`       |
| Format     | `bun run format`     |
| Release    | `./scripts/release.sh [major\|minor\|patch]` |
