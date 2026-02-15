
import { createClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

const envSupabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const envSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const hasValidEnvUrl =
  typeof envSupabaseUrl === 'string' &&
  envSupabaseUrl.length > 0 &&
  !envSupabaseUrl.includes('your-project-id');

const hasValidEnvKey =
  typeof envSupabaseAnonKey === 'string' &&
  envSupabaseAnonKey.length > 0 &&
  envSupabaseAnonKey !== 'your-anon-key';

const supabaseUrl = hasValidEnvUrl
  ? envSupabaseUrl
  : `https://${projectId}.supabase.co`;

const supabaseAnonKey = hasValidEnvKey ? envSupabaseAnonKey : publicAnonKey;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase configuration is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const SUPABASE_URL = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
