# Night Routine

A clock-driven night routine that shows its time as a place rather than a number.

The schedule runs on the real system clock in JST — `PIANO` 2h, then `ENGLISH`,
`CHINESE`, `SPANISH`, `FRENCH` at 30 minutes each, then `WORKOUT` for an hour;
19:30 on weekdays, 20:00 at weekends, crossing midnight. There is no start,
pause or reset control.

When a night has to begin late or early, Settings nudges the whole routine in
ten-minute steps, from an hour earlier to two hours later. The tasks keep their
lengths and order; only the hour they begin moves, and it stays moved until it
is changed back.

## What is on screen

No clock, no bar, no percentage, no remaining time. Each task gets one of a
hundred worlds, and the world itself carries the time:

- what has already passed keeps its detail — fog lifted, sand marked, light set;
- where you are now is the one moving, brightest thing;
- what is left is still veiled, flat or unvisited.

A short cue in the world's own timbre marks it starting, and a second, different
cue from the same family marks its last minute. When the time is up the world
stays; the task is only finished when you reach into it and close it by hand —
holding a light until it sets, drawing a contour closed, carrying something to
where it belongs. Afterwards that world keeps a specific mark, and the mark is
what the archive collects.

## Layout

    index.html        shell: canvas, the few controls, the archive
    src/schedule.js   the routine, in JST, midnight-crossing
    src/designs.js    the hundred worlds, as configuration
    src/engines.js    ten world engines the designs configure
    src/traces.js     the marks a finished world keeps
    src/audio.js      Web Audio synthesis — no audio files
    src/cues.js       timbre families and the cue builder
    src/completion.js hold / drag / trace / join / anchor / fold, plus keyboard
    src/scene.js      canvas host, frame loop, affordance and trace drawing
    src/store.js      localStorage: completions, cue bookkeeping, preferences
    src/history.js    the record, as a month calendar

Static files only — no build step. Serve the directory, or open `index.html`
through any local web server.
