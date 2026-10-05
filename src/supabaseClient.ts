import { createClient } from '@supabase/supabase-js';

export const DEFAULT_SUPABASE_URL = "https://kuhhgveogkdzgndlpede.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt1aGhndmVvZ2tkemduZGxwZWRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MDk2OTcsImV4cCI6MjEwNDI4NTY5N30.Ju6wPpRU1oFeHA_eIm1ljRcPpFoM4c9VQqBwZpjgKFs";

// Get user configured credentials if any
export function getSupabaseCredentials() {
  const customUrl = localStorage.getItem('efrat_sb_url');
  const customKey = localStorage.getItem('efrat_sb_key');
  return {
    url: customUrl || DEFAULT_SUPABASE_URL,
    key: customKey || DEFAULT_SUPABASE_ANON_KEY
  };
}

const { url, key } = getSupabaseCredentials();
export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  }
});
