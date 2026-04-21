# @paybacker/mcp

An [MCP](https://modelcontextprotocol.io) server that lets Claude Desktop read
your own [Paybacker](https://paybacker.co.uk) account data — transactions,
subscriptions, budgets, net worth and open disputes — so you can ask Claude
natural-language questions about your finances.

**Read-only.** This server cannot move money, cancel subscriptions, or change
anything in your account. If you revoke your token on paybacker.co.uk, Claude's
access stops immediately.

## Prerequisites

- Claude Desktop installed (macOS or Windows)
- A Paybacker Pro account — generate your personal access token at
  <https://paybacker.co.uk/dashboard/settings/mcp>
- Node.js 18 or later (Claude Desktop ships with its own Node runtime;
  `npx` will work)

## One-command setup

```bash
npx @paybacker/mcp setup
```

You'll be asked to paste the token you just generated. The setup script:

1. Finds your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac)
2. Adds a `paybacker` entry under `mcpServers` without touching anything else
3. Saves your token into the config so Claude can spawn the server with it

Quit and restart Claude Desktop, then ask something like:

> "What did I spend on food last month?"
> "Summarise my subscriptions, highest first."
> "How close am I to my holiday savings goal?"

## Manual setup

If you'd rather edit the config yourself, add this block:

```json
{
  "mcpServers": {
    "paybacker": {
      "command": "npx",
      "args": ["-y", "@paybacker/mcp"],
      "env": {
        "PAYBACKER_TOKEN": "pbk_YOUR_TOKEN_HERE"
      }
    }
  }
}
```

## What Claude can see

| Tool | What it returns |
|---|---|
| `get_transactions` | Bank transactions in the same schema as the Paybacker CSV export |
| `get_subscriptions` | Your tracked subscriptions + monthly / annual totals |
| `get_budget_summary` | This month's spending against each budget category |
| `get_net_worth_snapshot` | Assets, liabilities, net worth, and savings goals progress |
| `get_open_disputes` | Open complaint / dispute cases |
| `search_transactions` | Free-text search across descriptions and merchants |

## Security notes

- Your token is stored in your local Claude Desktop config. It never leaves your machine except when making HTTPS calls to `paybacker.co.uk`.
- Tokens expire after 180 days by default.
- You can revoke any token instantly at <https://paybacker.co.uk/dashboard/settings/mcp> — the next Claude request will fail and Claude will tell you why.
- You can have up to 10 active tokens (e.g. one per machine).

## Troubleshooting

Claude Desktop can't find the server:

- Check the config exists at the path above and contains valid JSON.
- Fully quit Claude Desktop (not just close the window) and reopen it.

Claude says "Token revoked" or "Token expired":

- Generate a new one at <https://paybacker.co.uk/dashboard/settings/mcp> and run `npx @paybacker/mcp setup` again.

Claude says "MCP access requires an active Pro plan":

- Your Paybacker subscription isn't currently Pro. Upgrade at <https://paybacker.co.uk/dashboard/upgrade>.

## Licence

MIT. © Paybacker LTD.
