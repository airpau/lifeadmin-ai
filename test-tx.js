require('dotenv').config({path: '.env'});
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: user } = await supabase.from('profiles').select('id, email').eq('email', 'sheva.tests.2026@outlook.com').single();
  if(!user) return console.log("User not found");
  
  const { data: txs, error } = await supabase
    .from('bank_transactions')
    .select('id, amount, timestamp, description')
    .eq('user_id', user.id);
    
  console.log("Total txs:", txs?.length);
  
  const { data: sum } = await supabase.rpc('get_monthly_spending_total', { 
    p_user_id: user.id, 
    p_year: 2026, 
    p_month: 4 
  });
  console.log("RPC spending:", sum);
}
run();
