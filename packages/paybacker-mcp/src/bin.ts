#!/usr/bin/env node
// Paybacker MCP CLI entry point.
//
// NOTE: this package is NOT published to npm. `npx -y @paybacker/mcp`
// returns a 404 from the registry. Everything here therefore refers to a
// LOCAL build: clone the repo, `npm install && npm run build`, then run
// `node dist/bin.js setup` (or point Claude Desktop straight at
// `dist/server.js`). Do not reintroduce npx instructions until the
// package is actually published.
//
// Usage (from a built checkout):
//   node dist/bin.js           run the stdio server (what Claude Desktop does)
//   node dist/bin.js setup     interactive setup — writes the Claude Desktop config
//   node dist/bin.js --help    show usage

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { homedir, platform } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP = `\
Paybacker MCP — connect Claude Desktop to your Paybacker account.

This package is not published to npm yet, so run it from a local build:

  npm install && npm run build
  node dist/bin.js setup

Commands:
  node dist/bin.js             Start the MCP server (Claude Desktop does this automatically)
  node dist/bin.js setup       Interactive setup — writes your Claude Desktop config for you
  node dist/bin.js --help      Show this message

Before running setup, generate a personal access token at:
  https://paybacker.co.uk/dashboard/settings/mcp
`;

/**
 * Absolute path to the built server this CLI belongs to. bin.js and
 * server.js are emitted side by side into dist/, so resolving relative
 * to this file always gives the matching server — no npm registry, no
 * npx, no guessing where the user cloned the repo.
 */
function serverEntryPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), 'server.js');
}

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
    // Point Claude Desktop at THIS checkout's built server by absolute
    // path. We used to write `npx -y @paybacker/mcp`, but the package has
    // never been published — that config produced a 404 on every launch.
    const serverPath = serverEntryPath();
    mcpServers.paybacker = {
      command: process.execPath,
      args: [serverPath],
      env: { PAYBACKER_TOKEN: token },
    };
    existing.mcpServers = mcpServers;

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(existing, null, 2) + '\n', 'utf8');

    console.log(`\n✅ Config written to ${path}`);
    console.log(`   Claude Desktop will run: ${process.execPath} ${serverPath}`);
    console.log(
      '   Keep this folder where it is — if you move or delete it, re-run setup.',
    );
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
