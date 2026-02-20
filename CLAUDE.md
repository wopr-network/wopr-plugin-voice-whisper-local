# wopr-plugin-voice-whisper-local

Local Whisper STT provider for WOPR using faster-whisper in Docker.

## Commands

```bash
npm run build     # tsc
npm run check     # biome check + tsc --noEmit (run before committing)
npm run format    # biome format --write src/
npm test          # vitest run
```

## Key Details

- Implements the `stt` capability provider from `@wopr-network/plugin-types`
- **Requires Docker** — faster-whisper runs in a container
- `faster-whisper` is a CTranslate2-optimized Whisper implementation — significantly faster than stock Whisper
- Fully local and offline — no API key, no data leaves the machine
- GPU acceleration available if host has CUDA — configured via Docker compose flags
- Config: model size (tiny/base/small/medium/large), Docker socket, language
- **Gotcha**: Large models (large-v3) require ~3GB+ VRAM or will fall back to CPU (slow)

## Plugin Contract

Imports only from `@wopr-network/plugin-types`. Never import from `@wopr-network/wopr` core.

## Issue Tracking

All issues in **Linear** (team: WOPR). Issue descriptions start with `**Repo:** wopr-network/wopr-plugin-voice-whisper-local`.

## Session Memory

At the start of every WOPR session, **read `~/.wopr-memory.md` if it exists.** It contains recent session context: which repos were active, what branches are in flight, and how many uncommitted changes exist. Use it to orient quickly without re-investigating.

The `Stop` hook writes to this file automatically at session end. Only non-main branches are recorded — if everything is on `main`, nothing is written for that repo.