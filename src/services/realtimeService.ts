// Optional Supabase Realtime subscription. It only tells the caretaker app that something changed;
// the data still comes from the API, and polling keeps working if this never connects. Row-level
// security decides which change events this token can see.
//
// Loaded on demand and wrapped in try/catch because a push channel is an accelerator, never a
// dependency: failing to connect must not affect alerts.

import { env } from '../config/env';
import { authService } from './authService';

interface Channel {
  unsubscribe(): unknown;
}

export function subscribeToChanges(onChange: () => void): () => void {
  if (!env.supabaseUrl || !env.supabaseAnonKey) return () => undefined;
  const token = authService.accessToken;
  if (!token) return () => undefined;

  let channel: Channel | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
    const client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    client.realtime.setAuth(token);
    channel = client
      .channel('safefall-caretaker')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fall_events' }, onChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'device_status' }, onChange)
      .subscribe();
  } catch {
    channel = null;
  }
  return () => {
    channel?.unsubscribe();
  };
}
