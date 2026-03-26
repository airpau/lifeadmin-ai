import { createClient } from '@supabase/supabase-js';

export async function resolveProviderLogo(providerName: string): Promise<string | null> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data } = await supabase
      .from('provider_domains')
      .select('domain')
      .ilike('provider_name', `%${providerName}%`)
      .limit(1)
      .single();

    if (data?.domain) {
      return `https://logo.clearbit.com/${data.domain}`;
    }

    return null;
  } catch {
    return null;
  }
}
