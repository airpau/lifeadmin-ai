const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data, error } = await supabase.from('bank_transactions').select('id, amount, merchant_name, description, timestamp, connection_id').limit(50);
  console.log(data ? data[0] : error);
})();
