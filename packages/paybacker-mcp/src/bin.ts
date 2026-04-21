#!/usr/bin/env node
// @paybacker/mcp CLI entry point.
//
// Usage:
//   npx @paybacker/mcp           run the stdio server (what Claude Desktop does)
//   npx @paybacker/mcp setup     interactive setup — writes the Claude Desktop config
//   npx @paybacker/mcp --help    show usage

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

const HELP = `\
@paybacker/mcp — connect Claude Desktop to your Paybacker account.

Commands:
  paybacker-mcp             Start the MCP server (Claude Desktop does this automatically)
  paybacker-mcp setup       Interactive setup — writes your Claude Desktop config for you
  paybacker-mcp --help      Show this message

Before running setup, generate a personal access token at:
  https://paybacker.co.uk/dashboard/settings/mcp
`;

function configPath(): string {
  const home = homedir();
  const plat = platform();
  if (plat === 'darwin') {
    return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  }
  if (plat === 'win32') {
    const appdata = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(appdata, 'Claude', 'claude_desktop_config.json');
  }
  // Linux / Claude Desktop is primarily Mac/Win, but we try XDG for completeness
  const xdg = process.env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(xdg, 'Claude', 'claude_desktop_config.json');
}

async function readConfig(path: string): Promise<Record<string, unknown>> {
  try {
    await access(path, constants.F_OK);
  } catch {
    return {};
  }
  try {
    const raw = await readFile(path, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch (e) {
    throw new Error(`Existing config at ${path} is not valid JSON. Please fix it manually.`);
  }
}

async function runSetup(): Promise<void> {
  console.log('\n🧾 Paybacker MCP setup\n');
  console.log(
    'This will add Paybacker to your Claude Desktop config so Claude can\n' +
      'read your transactions, subscriptions, budgets and net worth.\n',
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('Step 1: get your personal access token');
    console.log(
      '   Open https://paybacker.co.uk/dashboard/settings/mcp and click "Generate token".\n',
    );
    const token = (await rl.question('Paste your token here (starts with pbk_): ')).trim();

    if (!token.startsWith('pbk_')) {
      console.error('\n❌ That does not look like a Paybacker token. Expected it to start with pbk_.');
      process.exit(1);
    }

    const path = configPath();
    const existing = await readConfig(path);
    const mcpServers = (existing.mcpServers as Record<string, unknown> | undefined) ?? {};
    mcpServers.paybacker = {
      command: 'npx',
      args: ['-y', '@paybacker/mcp'],
      env: { PAYBACKER_TOKEN: token },
    };
    existing.mcpServers = mcpServers;

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(existing, null, 2) + '\n', 'utf8');

    console.log(`\n✅ Config written to ${path}`);
    console.log('\nFinal step:');
    console.log('   Quit and restart Claude Desktop, then ask:');
    console.log('   "What did I spend on food last month?"');
    console.log('\nIf something goes wrong, revoke the token at');
    console.log('   https://paybacker.co.uk/dashboard/settings/mcp\n');
  } finally {
    rl.close();
  }
}

async function main() {
  const [, , ...argv] = process.argv;
  const cmd = argv[0];

  if (cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP);
    return;
  }

  if (cmd === 'setup') {
    await runSetup();
    return;
  }

  if (!cmd) {
    // No args → run the stdio server (this is what Claude Desktop does)
    await import('./server.js');
    return;
  }

  console.error(`Unknown command: ${cmd}\n\n${HELP}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
