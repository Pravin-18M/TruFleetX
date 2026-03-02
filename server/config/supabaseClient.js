const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
// MUST be the service_role key (not the anon key) so the backend can bypass RLS.
// Get it from: Supabase Dashboard → Project Settings → API → service_role → Reveal
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("[Trufleet] SUPABASE_URL or SUPABASE_SERVICE_KEY is missing in .env — see .env.example");
}

if (supabaseKey.startsWith('eyJ') && supabaseKey.includes('"role":"anon"')) {
    console.warn("[Trufleet WARNING] You are using the anon key. RLS will block writes. Use service_role key instead.");
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

module.exports = supabase;