import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { capAtMs, devReset, devSetSeconds, devSkipSeconds, localRpc } from "./localServer"
import { readDayTotal, readEndReply, readRunningReply, readStateReply } from "./timerApi"
import { activeSeconds } from "./timerMaths"

// The local stand-in for the database must give the answers the app reads, and follow the rules of supabase/timer_schema.sql.
// 2026-10-07 10:00:00 UTC is 15:30 on 7 October in Asia/Kolkata.
const T0 = Date.parse("2026-10-07T10:00:00Z")
const ZONE = "Asia/Kolkata"

async function ok(name: string, args?: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await localRpc(name, args)
  if (error !== null) throw new Error("unexpected error " + error.message)
  return data
}

async function errorOf(name: string, args?: Record<string, unknown>): Promise<string> {
  const { error } = await localRpc(name, args)
  return error === null ? "no error" : error.message
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  devReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("the answers have the shape the app reads", () => {
  it("timer_state with nothing running", async () => {
    const reply = readStateReply(await ok("timer_state"))
    expect(reply.row).toBeNull()
    expect(reply.serverNowMs).toBe(T0)
  })

  it("timer_start, timer_pause, timer_resume and timer_end", async () => {
    const started = readRunningReply(await ok("timer_start", { p_tz: ZONE }))
    expect(started.row.status).toBe("running")
    vi.setSystemTime(T0 + 120_000)
    const paused = readRunningReply(await ok("timer_pause"))
    expect(paused.row.status).toBe("paused")
    vi.setSystemTime(T0 + 150_000)
    const resumed = readRunningReply(await ok("timer_resume"))
    expect(resumed.row.paused_seconds).toBe(30)
    vi.setSystemTime(T0 + 210_000)
    const ended = readEndReply(await ok("timer_end"))
    expect(ended).toMatchObject({ saved: true, capped: false, seconds: 180, day: "2026-10-07" })
  })

  it("timer_day_total adds up the saved sessions of that day only", async () => {
    await ok("timer_start", { p_tz: ZONE })
    vi.setSystemTime(T0 + 90_000)
    await ok("timer_end")
    expect(readDayTotal(await ok("timer_day_total", { p_day: "2026-10-07" }))).toBe(90)
    expect(readDayTotal(await ok("timer_day_total", { p_day: "2026-10-06" }))).toBe(0)
  })
})

describe("the rules of the SQL file", () => {
  it("raises BAD_TIMEZONE for a time zone that does not exist, ALREADY_RUNNING for a second start", async () => {
    expect(await errorOf("timer_start", { p_tz: "Mars/Olympus" })).toBe("BAD_TIMEZONE")
    expect(await errorOf("timer_start", {})).toBe("BAD_TIMEZONE")
    await ok("timer_start", { p_tz: ZONE })
    expect(await errorOf("timer_start", { p_tz: ZONE })).toBe("ALREADY_RUNNING")
  })

  it("raises NOT_RUNNING and NOT_PAUSED when there is nothing to pause, resume or end", async () => {
    expect(await errorOf("timer_pause")).toBe("NOT_RUNNING")
    expect(await errorOf("timer_resume")).toBe("NOT_RUNNING")
    expect(await errorOf("timer_end")).toBe("NOT_RUNNING")
    await ok("timer_start", { p_tz: ZONE })
    expect(await errorOf("timer_resume")).toBe("NOT_PAUSED")
    await ok("timer_pause")
    expect(await errorOf("timer_pause")).toBe("NOT_RUNNING")
  })

  it("does not save a session under 60 seconds, and still clears the running one", async () => {
    await ok("timer_start", { p_tz: ZONE })
    vi.setSystemTime(T0 + 59_000)
    expect(readEndReply(await ok("timer_end"))).toMatchObject({ saved: false, seconds: null })
    expect(readStateReply(await ok("timer_state")).row).toBeNull()
  })

  it("does not count the time a session was paused when it is ended while paused", async () => {
    await ok("timer_start", { p_tz: ZONE })
    vi.setSystemTime(T0 + 100_000)
    await ok("timer_pause")
    vi.setSystemTime(T0 + 500_000)
    expect(readEndReply(await ok("timer_end"))).toMatchObject({ saved: true, seconds: 100 })
  })

  it("answers an unknown function with an error", async () => {
    expect(await errorOf("timer_nope")).toContain("unknown function")
  })
})

describe("the local midnight", () => {
  it("is the end of the local day: 00:00 of 8 October in Asia/Kolkata is 18:30 UTC on 7 October", () => {
    expect(capAtMs(T0, ZONE)).toBe(Date.parse("2026-10-07T18:30:00Z"))
  })

  it("is found for a zone behind UTC too (Pacific/Honolulu, UTC-10)", () => {
    expect(capAtMs(Date.parse("2026-10-07T10:00:00Z"), "Pacific/Honolulu")).toBe(Date.parse("2026-10-08T10:00:00Z"))
  })

  it("cuts a session at midnight when it is ended after it", async () => {
    await ok("timer_start", { p_tz: ZONE })
    vi.setSystemTime(Date.parse("2026-10-07T20:00:00Z"))
    expect(await errorOf("timer_pause")).toBe("DAY_ENDED")
    const ended = readEndReply(await ok("timer_end"))
    expect(ended).toMatchObject({ saved: true, capped: true, seconds: 8.5 * 3600 })
  })
})

describe("the dev panel moves", () => {
  it("devSetSeconds puts a running session on exactly that many seconds", async () => {
    await ok("timer_start", { p_tz: ZONE })
    vi.setSystemTime(T0 + 7_000)
    expect(devSetSeconds(595)).toBe(true)
    const { serverNowMs, row } = readStateReply(await ok("timer_state"))
    expect(row).not.toBeNull()
    expect(activeSeconds(row!, serverNowMs)).toBe(595)
  })

  it("moves nothing when no session runs or when it is paused, and never crosses a midnight that has not come", async () => {
    expect(devSkipSeconds(60)).toBe(false)
    await ok("timer_start", { p_tz: ZONE })
    expect(devSkipSeconds(5400 * 4)).toBe(true)
    const { serverNowMs, row } = readStateReply(await ok("timer_state"))
    expect(activeSeconds(row!, serverNowMs)).toBe(5400 * 4)
    expect(await errorOf("timer_pause")).toBe("no error")
    expect(devSkipSeconds(60)).toBe(false)
  })
})
