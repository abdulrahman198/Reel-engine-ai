# Reel Engine AI v0.4

A modular AI short-video production engine.

## What works now
- React/Vite creator dashboard
- Arabic, German and English projects
- 30/45/60 second planning
- Real AI script + scene generation through the backend when `OPENAI_API_KEY` is configured
- Safe demo fallback when no API key is configured
- Structured scene timing, voiceover lines, visual-generation prompts and on-screen text

## Run
```bash
npm install
cp .env.example .env
# Add OPENAI_API_KEY to .env
npm run server
# in a second terminal
npm run dev
```

The API defaults to `http://localhost:8787`. Set `VITE_API_URL` when the backend is hosted elsewhere.

## Pipeline
Idea → AI Script → Scene Director → Voice → Captions → Media → Render → QA → Approval

## Next
v0.5 will add a voice-provider adapter (ElevenLabs first), audio files, transcription/caption timing, and render jobs.

Never commit `.env` or API keys to GitHub.
