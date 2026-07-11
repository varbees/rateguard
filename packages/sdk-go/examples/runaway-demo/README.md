# runaway-demo — the recording runbook

A real RateGuard-wrapped client halting a runaway agent, live. This is the
asset that goes at the top of the repo README and on the landing page.

## Why this format

For a developer tool, a **terminal recording is the credible format**: it is the
actual library doing the actual thing, and (with asciinema) the frames are real
text, not a staged video. Keep it that way. The credibility is that it is real.

Three things the research says matter, all baked in already:

1. **Action in the first seconds.** No logo, no intro. The header is three lines,
   then the budget starts burning. (82% of developers bail on a demo whose first
   15 seconds have no real output.)
2. **Show the enforcement happen.** The `BLOCKED 429` line is the moment. Real
   response, real header, real halt.
3. **Dark terminal.** Higher engagement with developers, and it is where this
   tool lives anyway.

## What you need

- **Nothing from the provider side.** No API key, no account, no spend. The demo
  talks to a local fake server and produces identical output every run.
- Go (already installed to build this repo).
- One of: `asciinema` + `agg` (the text-native route, recommended), or any screen
  recorder (Kap on macOS, Peek on Linux, ScreenToGif on Windows, OBS anywhere).

## The commands

Run from `packages/sdk-go`:

```bash
go run ./examples/runaway-demo            # the halt. ~25s. the money shot.
go run ./examples/runaway-demo -contrast  # unguarded loop first, then the guarded halt
go run ./examples/runaway-demo -pace 400ms # slower reveal, if 250ms feels quick
go run ./examples/runaway-demo -pace 0     # instant, for a sanity check
```

Default (`go run ./examples/runaway-demo`) is the one to record: the budget bar
fills call by call, then RateGuard halts the loop at the budget line.

## Record it → GIF (asciinema, recommended)

```bash
# one-time
brew install asciinema agg          # macOS  (Linux: pipx install asciinema; cargo install agg)

# from packages/sdk-go
asciinema rec runaway.cast -c "go run ./examples/runaway-demo"
agg runaway.cast runaway.gif --font-size 22 --speed 1.2 --theme asciinema
```

`agg` flags worth knowing: `--font-size`, `--speed` (1.2 tightens the idle gaps),
`--theme` (dark themes: `asciinema`, `monokai`, `dracula`), `--cols 84 --rows 26`
to pin the frame.

## Record it → video/GIF (screen recorder)

1. Dark theme, monospace font ~20pt, terminal window ~84 columns wide.
2. `clear` the screen first. Hide anything personal in the prompt (a clean
   `$ ` beats `you@laptop ~/secret/path %`).
3. Start recording, run `go run ./examples/runaway-demo`, stop a beat after the
   footer prints. Trim dead air at the ends.

## Terminal setup (either route)

- Dark background. ~20–22pt monospace (JetBrains Mono, IBM Plex Mono, SF Mono).
- ~84 columns so the rows do not wrap.
- No syntax-highlight plugins mangling the output; it is plain text on purpose.

## Where it goes

- Top of the repo `README.md`, right under the tagline (before the feature table).
- The landing page, near the hero or the "one line to ship" section.
- The Show HN / launch post.

Keep the file small (a 22pt, 84-col, ~25s GIF lands around 1–2 MB with `agg`).
