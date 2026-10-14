import { useEffect } from "react"
import TimerScreen from "@/components/TimerScreen"
import TimeMachine from "@/devtools/TimeMachine"
import { warmTimerScreen } from "@/lib/timerWarmup"

// The whole app is the Pro Timer screen, as in ASHBORN, but without the login, the menu and the database: the "database" is the local stand-in (src/lib/localServer.ts).
// The time machine (src/devtools/TimeMachine.tsx) is a small panel for looking at the 10, 30 and 90 minute colour steps of the background without waiting. Add ?dev=0 to the address to hide it.
export default function App() {
  useEffect(() => {
    // The font and the WebGL 2 check, a moment after the first picture. The local stand-in needs no warm-up, so the database part is off.
    warmTimerScreen(false)
  }, [])

  const showDev = new URLSearchParams(window.location.search).get("dev") !== "0"

  return (
    <>
      <TimerScreen />
      {showDev ? <TimeMachine /> : null}
    </>
  )
}
