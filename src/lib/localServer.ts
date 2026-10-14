import { localDay } from "@/lib/timerMaths"

// A stand-in for the database of the Pro Timer, kept in this browser (localStorage).
// It follows supabase/timer_schema.sql function by function: the same six functions, the same answers, the same error names, the same rules (60 second minimum, one running session, the local midnight cap, the server clock as the only clock).
// The "server" clock is this device's clock. Nothing leaves the browser.
// Only the dev panel (src/devtools/TimeMachine.tsx) uses devSkipSeconds and devReset: they have no counterpart in the SQL file.

type StoredRow = {
  started_at: string
  tz: string
  status: "running" | "paused"
  paused_at: string | null
  paused_seconds: number
  // The start the midnight cap is counted from. It never moves, even when the dev panel moves started_at back, so jumping ahead in a session can never cross a midnight that has not really come.
  cap_basis: string
}

type StoredSession = {
  id: string
  day: string
  started_at: string
  ended_at: string
  active_seconds: number
}

type Store = { running: StoredRow | null; sessions: StoredSession[] }

const STORAGE_KEY = "gradient-test:pro-timer:v1"

let memory: Store = { running: null, sessions: [] }

function load(): Store {
  try {
    const text = window.localStorage.getItem(STORAGE_KEY)
    if (text === null) return memory
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed === "object" && parsed !== null && "sessions" in parsed && "running" in parsed) {
      memory = parsed as Store
    }
  } catch {
    // no storage (private window) or broken text: the copy in memory is used
  }
  return memory
}

function save(store: Store): void {
  memory = store
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // no storage: the copy in memory is used until the page closes
  }
}

class RaisedError extends Error {}

function raise(name: string): never {
  throw new RaisedError(name)
}

function nowMs(): number {
  return Date.now()
}

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

// The offset of a time zone from UTC at one moment, in milliseconds.
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms))
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0")
  const asUtc = Date.UTC(pick("year"), pick("month") - 1, pick("day"), pick("hour"), pick("minute"), pick("second"))
  return asUtc - Math.floor(ms / 1000) * 1000
}

// timer_cap_at: the first local midnight after the start (the end of that local day).
export function capAtMs(startedMs: number, timeZone: string): number {
  const [y, m, d] = localDay(startedMs, timeZone).split("-").map(Number)
  const nextMidnightAsUtc = Date.UTC(y, m - 1, d + 1)
  let guess = nextMidnightAsUtc - zoneOffsetMs(nextMidnightAsUtc, timeZone)
  guess = nextMidnightAsUtc - zoneOffsetMs(guess, timeZone)
  return guess
}

function rowJson(row: StoredRow) {
  return {
    started_at: row.started_at,
    tz: row.tz,
    status: row.status,
    paused_at: row.paused_at,
    paused_seconds: row.paused_seconds,
    cap_at: iso(capAtMs(Date.parse(row.cap_basis), row.tz)),
  }
}

function validZone(zone: unknown): zone is string {
  if (typeof zone !== "string" || zone === "") return false
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone })
    return true
  } catch {
    return false
  }
}

function capOf(row: StoredRow): number {
  return capAtMs(Date.parse(row.cap_basis), row.tz)
}

function timerState() {
  const { running } = load()
  return { server_now: iso(nowMs()), running: running === null ? null : rowJson(running) }
}

function timerDayTotal(day: unknown): number {
  const { sessions } = load()
  return sessions.filter((s) => s.day === day).reduce((sum, s) => sum + s.active_seconds, 0)
}

function timerStart(zone: unknown) {
  if (!validZone(zone)) raise("BAD_TIMEZONE")
  const store = load()
  if (store.running !== null) raise("ALREADY_RUNNING")
  const started = iso(nowMs())
  const row: StoredRow = { started_at: started, tz: zone, status: "running", paused_at: null, paused_seconds: 0, cap_basis: started }
  save({ ...store, running: row })
  return { server_now: iso(nowMs()), running: rowJson(row) }
}

function timerPause() {
  const store = load()
  const row = store.running
  if (row === null) raise("NOT_RUNNING")
  if (nowMs() >= capOf(row)) raise("DAY_ENDED")
  if (row.status !== "running") raise("NOT_RUNNING")
  const next: StoredRow = { ...row, status: "paused", paused_at: iso(nowMs()) }
  save({ ...store, running: next })
  return { server_now: iso(nowMs()), running: rowJson(next) }
}

function timerResume() {
  const store = load()
  const row = store.running
  if (row === null) raise("NOT_RUNNING")
  if (nowMs() >= capOf(row)) raise("DAY_ENDED")
  if (row.status !== "paused" || row.paused_at === null) raise("NOT_PAUSED")
  const next: StoredRow = {
    ...row,
    status: "running",
    paused_seconds: row.paused_seconds + (nowMs() - Date.parse(row.paused_at)) / 1000,
    paused_at: null,
  }
  save({ ...store, running: next })
  return { server_now: iso(nowMs()), running: rowJson(next) }
}

function timerEnd() {
  const store = load()
  const row = store.running
  if (row === null) raise("NOT_RUNNING")
  const cap = capOf(row)
  const capped = nowMs() >= cap
  const end = Math.min(nowMs(), cap)
  const startedMs = Date.parse(row.started_at)
  const ref = row.status === "paused" && row.paused_at !== null ? Math.min(Date.parse(row.paused_at), end) : end
  const active = Math.max(0, Math.floor((ref - startedMs) / 1000 - row.paused_seconds))
  if (active >= 60 && end > startedMs) {
    const session: StoredSession = {
      id: crypto.randomUUID(),
      day: localDay(Date.parse(row.cap_basis), row.tz),
      started_at: row.started_at,
      ended_at: iso(end),
      active_seconds: active,
    }
    save({ running: null, sessions: [...store.sessions, session] })
    return {
      server_now: iso(nowMs()),
      saved: true,
      capped,
      session: { id: session.id, day: session.day, started_at: session.started_at, ended_at: session.ended_at, active_seconds: session.active_seconds },
    }
  }
  save({ ...store, running: null })
  return { server_now: iso(nowMs()), saved: false, capped, session: null }
}

// The same shape as the answer of supabase.rpc: { data, error }. A function that raises gives the error name as the message, like a SQL "raise exception".
export async function localRpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> {
  try {
    switch (name) {
      case "timer_state":
        return { data: timerState(), error: null }
      case "timer_day_total":
        return { data: timerDayTotal(args?.p_day), error: null }
      case "timer_start":
        return { data: timerStart(args?.p_tz), error: null }
      case "timer_pause":
        return { data: timerPause(), error: null }
      case "timer_resume":
        return { data: timerResume(), error: null }
      case "timer_end":
        return { data: timerEnd(), error: null }
      default:
        return { data: null, error: { message: "unknown function " + name } }
    }
  } catch (caught) {
    if (caught instanceof RaisedError) return { data: null, error: { message: caught.message } }
    return { data: null, error: { message: String(caught) } }
  }
}

// ---- Dev panel only ----

// Moves the start of a RUNNING session back, so the session is that many seconds older. Returns false when nothing is running (a paused session does not grow, so it is not moved).
export function devSkipSeconds(seconds: number): boolean {
  const store = load()
  const row = store.running
  if (row === null || row.status !== "running") return false
  const moved: StoredRow = { ...row, started_at: iso(Date.parse(row.started_at) - seconds * 1000) }
  save({ ...store, running: moved })
  return true
}

// Moves a running session to exactly this many seconds of active time (later or earlier than now).
export function devSetSeconds(target: number): boolean {
  const store = load()
  const row = store.running
  if (row === null || row.status !== "running") return false
  const activeNow = (nowMs() - Date.parse(row.started_at)) / 1000 - row.paused_seconds
  return devSkipSeconds(target - activeNow)
}

// Throws away the running session and all saved sessions.
export function devReset(): void {
  save({ running: null, sessions: [] })
}
