import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config";

const config = loadConfig();

export const supabase = createClient(
  config.SUPABASE_URL,
  config.SUPABASE_SECRET_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
