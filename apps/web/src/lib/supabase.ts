import { createClient } from '@supabase/supabase-js';

// Load Supabase URL and Anon Key from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Fallback to placeholder to prevent client crash on load
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseKey || 'placeholder-anon-key'
);

export const hasSupabase = !!(supabaseUrl && supabaseKey);
