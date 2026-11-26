// Public settings of the Supabase project (Project Settings → API).
// Only the public "anon" / "publishable" key goes here; never the "service_role" / "secret" key.
// If URL and key are left empty and index.html is opened by double click, the app runs in local test mode.
window.HRMS_CONFIG = {
  SUPABASE_URL: 'https://ppozoprmfjempmhbttib.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_UJIKEg9gHH9cZRE4ojy02w_m08BSbBU',
  // User name typed on the login screen. The password is checked by the database
  // (see supabase/schema.sql) and is never stored in the code.
  SHARED_USERNAME: 'estudiantsLIPPSO',
};
