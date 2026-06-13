import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { env } from '../config/env';
import { logger } from './logger';

const supabaseUrl = env.SUPABASE_URL;
const supabaseKey = env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  logger.warn('⚠️ Supabase credentials missing (SUPABASE_URL/SUPABASE_ANON_KEY). Authentication will run in mock-fallback mode.');
}

// Fallback to placeholders if not defined to prevent initialization crash
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-project.supabase.co',
  supabaseKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: false,
    },
    realtime: {
      transport: ws as any,
    }
  }
);

export const hasSupabase = !!(supabaseUrl && supabaseKey);
