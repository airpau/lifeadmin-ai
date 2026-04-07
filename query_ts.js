require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function run() {
  const { data, error } = await supabase.from('bank_transactions').select('timestamp, amount, description').order('timestamp', { ascending: false }).limit(5);
  console.log("DB DATA:", data, error);
}
run();
