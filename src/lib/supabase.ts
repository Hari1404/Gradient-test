import { localRpc } from "@/lib/localServer"

// STAND-IN for the database client of ASHBORN (src/lib/supabase.ts there).
// timerApi.ts, the hook and the tests are the same files as in ASHBORN and only know `supabase.rpc(name, args)`; here that call is answered by the local stand-in server (src/lib/localServer.ts, kept in this browser) instead of by Supabase.
// To use a real database later: put the real createClient(...) here, run supabase/timer_schema.sql in it, and nothing else has to change.
export const supabase: { rpc: typeof localRpc } | null = { rpc: localRpc }
