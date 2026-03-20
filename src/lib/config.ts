/**
 * Environment configuration with validation
 * Validates all required environment variables on startup
 */

interface Config {
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  anthropic: {
    apiKey: string;
  };
  stripe: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
    prices: {
      essentialMonthly: string;
      essentialYearly: string;
      proMonthly: string;
      proYearly: string;
    };
  };
  resend: {
    apiKey: string;
  };
  app: {
    url: string;
    env: 'development' | 'production' | 'test';
  };
}

function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  
  return value || '';
}

function validateConfig(): Config {
  // Only validate server-side
  if (typeof window !== 'undefined') {
    return {} as Config;
  }

  const config: Config = {
    supabase: {
      url: getEnvVar('NEXT_PUBLIC_SUPABASE_URL', false),
      anonKey: getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', false),
      serviceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY', false),
    },
    anthropic: {
      apiKey: getEnvVar('ANTHROPIC_API_KEY', false),
    },
    stripe: {
      secretKey: getEnvVar('STRIPE_SECRET_KEY', false),
      publishableKey: getEnvVar('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', false),
      webhookSecret: getEnvVar('STRIPE_WEBHOOK_SECRET', false),
      prices: {
        essentialMonthly: getEnvVar('STRIPE_PRICE_ESSENTIAL_MONTHLY', false) || 'price_essential_monthly',
        essentialYearly: getEnvVar('STRIPE_PRICE_ESSENTIAL_YEARLY', false) || 'price_essential_yearly',
        proMonthly: getEnvVar('STRIPE_PRICE_PRO_MONTHLY', false) || 'price_pro_monthly',
        proYearly: getEnvVar('STRIPE_PRICE_PRO_YEARLY', false) || 'price_pro_yearly',
      },
    },
    resend: {
      apiKey: getEnvVar('RESEND_API_KEY', false),
    },
    app: {
      url: getEnvVar('NEXT_PUBLIC_APP_URL', false) || 'http://localhost:3000',
      env: (getEnvVar('NODE_ENV', false) || 'development') as Config['app']['env'],
    },
  };

  return config;
}

export const config = validateConfig();

export function isConfigured(service: 'supabase' | 'anthropic' | 'stripe' | 'resend'): boolean {
  switch (service) {
    case 'supabase':
      return !!(config.supabase.url && config.supabase.anonKey);
    case 'anthropic':
      return !!config.anthropic.apiKey;
    case 'stripe':
      return !!config.stripe.secretKey;
    case 'resend':
      return !!config.resend.apiKey;
    default:
      return false;
  }
}
