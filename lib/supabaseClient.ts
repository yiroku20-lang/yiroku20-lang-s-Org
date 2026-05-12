import { createClient } from '@supabase/supabase-js';

// Default credentials provided by user
// NOTE: Ideally these should be environment variables.
const DEFAULT_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';

// UPDATE: Using the provided 'anon' / 'public' key.
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs'; 

// Helper to get keys with priority: LocalStorage > Env > Default Constant
const getUrl = () => localStorage.getItem('supabase_url') || process.env.SUPABASE_URL || DEFAULT_URL;
const getKey = () => localStorage.getItem('supabase_key') || process.env.SUPABASE_ANON_KEY || DEFAULT_KEY;

const supabaseUrl = getUrl();
const supabaseAnonKey = getKey();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please configure them in the Settings page.');
}

// Initialize with a placeholder if missing to prevent crash, but requests will fail until configured
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

// Helper to check if we have valid-looking keys
export const isConfigured = () => {
    const url = getUrl();
    const key = getKey();
    return url.length > 0 && key.length > 0 && url !== 'https://placeholder.supabase.co' && key !== 'placeholder';
};