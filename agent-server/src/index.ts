import express from 'express';
import { config } from './config';
import { router } from './api/routes';
import { startScheduler } from './scheduler';
import { agentRegistry } from './agents/registry';

const app = express();

app.use(express.json({ limit: '10mb' }));

// Register all routes
app.use(router);

// Start the server
app.listen(config.PORT, () => {
  console.log('');
  console.log('=== Paybacker Agent Server ===');
  console.log(`Port: ${config.PORT}`);
  console.log(`Agents: ${Object.keys(agentRegistry).length}`);
  console.log(`Enabled: ${config.AGENTS_ENABLED}`);
  console.log(`Max budget per run: $${config.AGENT_MAX_BUDGET_USD}`);
  console.log(`Max turns per run: ${config.AGENT_MAX_TURNS}`);
  console.log('');

  // List all agents and their schedules
  for (const [role, agent] of Object.entries(agentRegistry)) {
    console.log(`  ${agent.name.padEnd(30)} ${agent.schedule.padEnd(20)} ${agent.model}`);
  }
  console.log('');

  // Start the scheduler
  if (config.AGENTS_ENABLED) {
    startScheduler();
  } else {
    console.log('[Server] Agents are DISABLED. Set AGENTS_ENABLED=true to start.');
  }

  console.log('=== Server Ready ===');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received. Shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received. Shutting down...');
  process.exit(0);
});
// Railway rebuild trigger Thu Mar 26 01:21:21 GMT 2026
