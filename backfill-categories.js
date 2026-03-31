require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

async function run() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('Fetching merchant rules...');
  const { data: rules, error: rulesErr } = await supabase.from('merchant_rules').select('merchant_name, category');
  if (rulesErr) throw rulesErr;
  
  console.log(`Found ${rules.length} rules. Fetching pre-Dec 2025 uncategorized transactions...`);
  const { data: txs, error: txsErr } = await supabase
    .from('bank_transactions')
    .select('id, description, merchant_name')
    .lt('timestamp', '2025-12-01T00:00:00Z')
    .is('user_category', null);
    
  if (txsErr) throw txsErr;
  console.log(`Found ${txs.length} transactions to check.`);

  let updated = 0;
  for (const tx of txs) {
    const desc = (tx.merchant_name || tx.description || '').toLowerCase();
    const matchedRule = rules.find(r => desc.includes(r.merchant_name.toLowerCase()));
    if (matchedRule) {
      const { error } = await supabase
        .from('bank_transactions')
        .update({ user_category: matchedRule.category })
        .eq('id', tx.id);
      if (error) console.error(`Failed to update ${tx.id}:`, error);
      else updated++;
    }
  }
  console.log(`Backfill complete. Updated ${updated} transactions.`);
}
run().catch(console.error);
