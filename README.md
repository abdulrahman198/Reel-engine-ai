# Reel Engine AI v0.3
A clean React/Vite foundation for an AI Reel production pipeline.

## Current
- One React/Vite frontend (old duplicate entrypoint removed from architecture)
- Arabic / German / English project planner
- 30/45/60 second scene planning
- Editable script
- Provider-ready backend skeleton
- Environment-variable placeholders; no secrets committed

## Planned pipeline
Topic → AI Script → Scene Director → Media → ElevenLabs Voice → Whisper Captions → FFmpeg/Remotion Render → QA → Human Approval

## Run
```bash
npm install
npm run dev
```
Optional backend:
```bash
cp .env.example .env
npm run server
```
API health: `http://localhost:8787/api/health`
