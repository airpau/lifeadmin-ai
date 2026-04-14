import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
(async () => {
    const { data: user } = await supabase.from('profiles').select('id, email').eq('email', 'aireypaul@googlemail.com').single();
    if (!user) return console.log('no user');
    const { data: conns } = await supabase.from('bank_connections').select('*').eq('user_id', user.id);
    console.log(JSON.stringify(conns, null, 2));
})();
