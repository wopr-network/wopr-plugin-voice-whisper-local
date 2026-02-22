# wopr-plugin-voice-whisper-local

Local Whisper STT provider for WOPR using faster-whisper in Docker.

## Commands

```bash
npm run build     # tsc
npm run check     # biome check src/ tests/ + tsc --noEmit (run before committing)
npm run format    # biome format --write src/ tests/
npm run lint:fix  # biome check --fix src/ tests/
npm test          # vitest run
```

**Linter/formatter is Biome.** Never add ESLint/Prettier config.

## Architecture

```
src/
  index.ts      # Plugin entry — exports WOPRPlugin default
  types.ts      # Plugin-local types (WhisperLocalConfig, STT interfaces, configSchema)
  provider.ts   # WhisperLocalProvider and WhisperLocalSession classes
tests/
  index.test.ts   # Plugin lifecycle tests (init/shutdown)
  webmcp.test.ts  # WebMCP tool declaration tests
```

## Key Details

- Implements the `stt` capability provider
- **Requires Docker** — faster-whisper runs in a container
- `faster-whisper` is a CTranslate2-optimized Whisper implementation — significantly faster than stock Whisper
- Fully local and offline — no API key, no data leaves the machine
- GPU acceleration available if host has CUDA — configured via Docker compose flags
- Config: model size (tiny/base/small/medium/large-v3), port, language, Docker image
- **Gotcha**: Large models (large-v3) require ~3GB+ VRAM or will fall back to CPU (slow)

## Plugin Contract

Imports only from `@wopr-network/plugin-types`. Never import from `@wopr-network/wopr` core.

## Issue Tracking

All issues in **Linear** (team: WOPR). Issue descriptions start with `**Repo:** wopr-network/wopr-plugin-voice-whisper-local`.
