import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Claude
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_AGENTS_API_KEY: z.string().optional(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Email
  RESEND_API_KEY: z.string().min(1),
  FROM_EMAIL: z.string().default('agents@paybacker.co.uk'),
  REPLY_TO: z.string().default('hello@paybacker.co.uk'),
  FOUNDER_EMAIL: z.string().default('hello@paybacker.co.uk'),

  // Stripe
  STRIPE_SECRET_KEY: z.string().min(1),

  // Security
  CRON_SECRET: z.string().min(1),

  // Optional integrations
  FAL_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),
  IPAPI_KEY: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().default('https://app.posthog.com'),

  // Site
  SITE_URL: z.string().default('https://paybacker.co.uk'),

  // Server
  PORT: z.coerce.number().default(3000),

  // Agent controls
  AGENTS_ENABLED: z.string().default('true').transform(v => v !== 'false'),
  AGENT_MAX_BUDGET_USD: z.coerce.number().default(0.50),
  AGENT_MAX_TURNS: z.coerce.number().default(15),
});

function loadConfig() {
  const raw = {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_AGENTS_API_KEY: process.env.ANTHROPIC_AGENTS_API_KEY,
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    FROM_EMAIL: process.env.FROM_EMAIL,
    REPLY_TO: process.env.REPLY_TO,
    FOUNDER_EMAIL: process.env.FOUNDER_EMAIL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    FAL_KEY: process.env.FAL_KEY,
    PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
    IPAPI_KEY: process.env.IPAPI_KEY,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    POSTHOG_API_KEY: process.env.POSTHOG_API_KEY,
    POSTHOG_HOST: process.env.POSTHOG_HOST,
    SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    PORT: process.env.PORT,
    AGENTS_ENABLED: process.env.AGENTS_ENABLED,
    AGENT_MAX_BUDGET_USD: process.env.AGENT_MAX_BUDGET_USD,
    AGENT_MAX_TURNS: process.env.AGENT_MAX_TURNS,
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    console.error('Invalid configuration:', result.error.format());
    process.exit(1);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = z.infer<typeof configSchema>;
