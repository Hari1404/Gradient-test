import { useState } from "react"
import { devReset, devSetSeconds, devSkipSeconds } from "@/lib/localServer"
import "./timeMachine.css"

// The time machine: a small panel (top left) for looking at the colour steps of the Pro Timer without waiting for them.
// It moves the start of the RUNNING session, so the session is older, then asks the timer screen to read again (the same event a browser sends when a page comes back). The colour blend then runs for real, for the full blend time.
// The steps are at 10, 30 and 90 minutes (SOLID_FROM_SECONDS, DEEP_FROM_SECONDS and FLOW_FROM_SECONDS in src/lib/timerMaths.ts). "5 s before" puts the session just short of a step, so the blend can be watched from its first moment.
// Not part of the Pro Timer in ASHBORN: only this test repo has it.

const JUMPS: readonly { label: string; seconds: number }[] = [
  { label: "5 s before 10:00", seconds: 10 * 60 - 5 },
  { label: "5 s before 30:00", seconds: 30 * 60 - 5 },
  { label: "5 s before 90:00", seconds: 90 * 60 - 5 },
]

const SKIPS: readonly { label: string; seconds: number }[] = [
  { label: "+1 min", seconds: 60 },
  { label: "+10 min", seconds: 600 },
]

function readAgain(): void {
  window.dispatchEvent(new Event("pageshow"))
}

export default function TimeMachine() {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState("")

  const jumpTo = (seconds: number) => {
    setMessage(devSetSeconds(seconds) ? "" : "Press Start first (and Resume if paused).")
    readAgain()
  }
  const skip = (seconds: number) => {
    setMessage(devSkipSeconds(seconds) ? "" : "Press Start first (and Resume if paused).")
    readAgain()
  }
  const reset = () => {
    devReset()
    setMessage("")
    readAgain()
  }

  return (
    <aside className="gt-dev" data-open={open ? "on" : undefined}>
      <button className="gt-dev-toggle" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Time machine
      </button>
      {open ? (
        <div className="gt-dev-panel">
          <p className="gt-dev-title">Jump the running session to</p>
          <div className="gt-dev-row">
            {JUMPS.map((j) => (
              <button key={j.label} type="button" onClick={() => jumpTo(j.seconds)}>
                {j.label}
              </button>
            ))}
          </div>
          <p className="gt-dev-title">Or skip ahead</p>
          <div className="gt-dev-row">
            {SKIPS.map((s) => (
              <button key={s.label} type="button" onClick={() => skip(s.seconds)}>
                {s.label}
              </button>
            ))}
          </div>
          <div className="gt-dev-row">
            <button type="button" onClick={reset}>
              Reset all data
            </button>
          </div>
          <p className="gt-dev-note" role="status">
            {message}
          </p>
        </div>
      ) : null}
    </aside>
  )
}
