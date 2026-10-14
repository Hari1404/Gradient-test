# Gradient test: the Pro Timer on its own

The ASHBORN Pro Timer (clock, glowing ball, Grainient background, stop alert, comeback and milestone messages) without the login, the menu and the database. It is here so the moving background can be looked at and changed on its own.

The timer code is copied from `Hari1404/ASHBORN` (master, Packet 08A). The background behaves exactly as it does there: black for the first 10 minutes, then a 12 second blend at 10:00, 30:00 and 90:00.

## Run it

```bash
npm install     # .npmrc turns on legacy-peer-deps, npm 10 crashes on the peer set otherwise
npm run dev     # http://localhost:5173
npm test        # 911 tests
npm run build
```

## The time machine

Press **Start**, then open **Time machine** (top left). It moves the running session so you do not have to wait:

- **5 s before 10:00 / 30:00 / 90:00** puts the session 5 seconds short of a colour step. Watch the blend from its first moment.
- **+1 min / +10 min** skips ahead.
- **Reset all data** clears the running session and the saved ones.

Add `?dev=0` to the address to hide the panel. Add `?lite=0`, `?lite=1` or `?lite=2` to force a lite level, as in ASHBORN (`?lite=2` draws no background).

## What is different from ASHBORN

| | ASHBORN | Here |
|---|---|---|
| Database | Supabase (`supabase/timer_schema.sql`) | A stand-in in `src/lib/localServer.ts`, kept in this browser (localStorage), same six functions, same errors, same rules |
| `src/lib/supabase.ts` | the real client | a stand-in with the one call the timer uses, `rpc(name, args)` |
| Login, menu, other screens | yes | no |
| Time machine | no | `src/devtools/` |

Everything else (`timerMaths`, `timerApi`, `useTimer`, `ballLook`, `backgroundLook`, the screen and its css, the library animations) is the same file as in ASHBORN, tests included. The tag comments (`AB:...`) and the `CONNECTIONS.md` references in them point to the files in the ASHBORN repo.

## Where the background lives

- `src/lib/backgroundLook.ts`: the settings, the six palettes, the ramp of each colour step (`bgRamp`), the blend (`bgBlendRamp`, `BG_BLEND_MS`)
- `src/components/TimerBackground.tsx`: the box and the blend over time
- `src/components/Grainient.tsx`: the library animation (never edited)
- `src/timer.css`: the dimming, the shade at the bottom, the fade

## Using a real database later

Put a real `createClient(...)` in `src/lib/supabase.ts` and run `supabase/timer_schema.sql` in that project. `timerApi.ts` and the rest do not change.
