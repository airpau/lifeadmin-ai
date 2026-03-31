const { createClient } = require('@supabase/supabase-js');

// Load environment variables if they exist
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const RULES = [
  { raw_name: 'PAYPAL *DISNEYPLUS%', display_name: 'Disney+' },
  { raw_name: 'PAYPAL *WWW.PLEX.TV%', display_name: 'Plex' },
  { raw_name: 'PAYPAL *LEBARA%', display_name: 'Lebara' },
  { raw_name: 'EXPERIAN%', display_name: 'Experian' },
  { raw_name: 'ENERGIE FI%', display_name: 'énergie Fitness' },
  { raw_name: 'B/CARD PLAT%', display_name: 'Barclaycard Platinum Visa' },
  { raw_name: 'LBH%', display_name: 'London Borough of Hounslow' },
  { raw_name: 'TESTVALLEY%', display_name: 'Test Valley Borough Council' },
  { raw_name: 'DVLA-A15EYP%', display_name: 'DVLA Vehicle Tax' },
  { raw_name: 'COMMUNITYFIBRE%', display_name: 'Community Fibre' },
];

async function seed() {
  console.log("Seeding merchant rules...");
  for (const rule of RULES) {
    const { data, error } = await supabase
      .from('merchant_rules')
      .upsert({ 
        pattern: rule.raw_name, 
        display_name: rule.display_name,
        created_at: new Date().toISOString()
      }, { onConflict: 'pattern' });

    if (error) {
      console.error(`Error inserting ${rule.display_name}:`, error.message);
    } else {
      console.log(`Successfully mapped ${rule.raw_name} -> ${rule.display_name}`);
    }
  }
  console.log("Finished seeding merchant rules.");
}

seed();
