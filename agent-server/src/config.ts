import dotenv from 'dotenv';

dotenv.config();

interface Config {
  ANTHROPIC_API_KEY: string;
  ANTHROPIC_AGENTS_API_KEY?: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  FROM_EMAIL: string;
  REPLY_TO: string;
  FOUNDER_EMAIL: string;
  STRIPE_SECRET_KEY: string;
  CRON_SECRET: string;
  FAL_KEY?: string;
  PERPLEXITY_API_KEY?: string;
  IPAPI_KEY?: string;
  GITHUB_TOKEN?: string;
  POSTHOG_API_KEY?: string;
  POSTHOG_HOST: string;
  SITE_URL: string;
  PORT: number;
  AGENTS_ENABLED: boolean;
  AGENT_MAX_BUDGET_USD: number;
  AGENT_MAX_TURNS: number;
}

function requireEnv(key: string, envKey?: string): string {
  const val = process.env[envKey || key];
  if (!val || val.length === 0) {
    console.error(`Missing required env var: ${envKey || key}`);
    process.exit(1);
  }
  return val;
}

function loadConfig(): Config {
  return {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_AGENTS_API_KEY || requireEnv('ANTHROPIC_API_KEY'),
    ANTHROPIC_AGENTS_API_KEY: process.env.ANTHROPIC_AGENTS_API_KEY || undefined,
    SUPABASE_URL: requireEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    RESEND_API_KEY: requireEnv('RESEND_API_KEY'),
    FROM_EMAIL: process.env.FROM_EMAIL || 'agents@paybacker.co.uk',
    REPLY_TO: process.env.REPLY_TO || 'hello@paybacker.co.uk',
    FOUNDER_EMAIL: process.env.FOUNDER_EMAIL || 'hello@paybacker.co.uk',
    STRIPE_SECRET_KEY: requireEnv('STRIPE_SECRET_KEY'),
    CRON_SECRET: requireEnv('CRON_SECRET'),
    FAL_KEY: process.env.FAL_KEY || undefined,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY || undefined,
    IPAPI_KEY: process.env.IPAPI_KEY || undefined,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN || undefined,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY || undefined,
    POSTHOG_HOST: process.env.POSTHOG_HOST || 'https://app.posthog.com',
    SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk',
    PORT: Number(process.env.PORT) || 3000,
    AGENTS_ENABLED: process.env.AGENTS_ENABLED !== 'false',
    AGENT_MAX_BUDGET_USD: Number(process.env.AGENT_MAX_BUDGET_USD) || 0.50,
    AGENT_MAX_TURNS: Number(process.env.AGENT_MAX_TURNS) || 15,
  };
}

export const config = loadConfig();
export type { Config };
