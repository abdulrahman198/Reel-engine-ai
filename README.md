# Reel Engine AI v0.7

A working, single-user video studio: **idea → script → scene images → narration/subtitles → downloadable MP4**.

[دليل التشغيل بالعربي](START_HERE_AR.md)

## What works

- Arabic, German and English interface; Arabic layout and script direction.
- AI script and scene planning with OpenAI structured outputs, or an explicitly labelled demo plan without a key.
- Multiple projects, automatic server saves and a browser draft backup. Export/import the script and scene plan as JSON.
- Editable script, image prompts, scene titles and on-screen text.
- OpenAI image generation, uploaded PNG/JPEG/WebP images, or labelled demo cards.
- ElevenLabs narration with timed SRT subtitles and voice selection.
- Upload your own MP3/WAV/M4A/OGG/FLAC/WebM audio and UTF-8 SRT subtitles without API keys.
- Real FFmpeg MP4 export: 9:16 or 16:9, 720p or 1080p, 30 fps, H.264/AAC, camera movement, text overlays and optional burned-in subtitles.
- Job progress and reconnecting to the same export after a browser refresh. Interrupted server jobs are marked failed with a retry message.

This version animates **still images**. It does not generate moving footage with Flow, Veo or Kling. Scene cuts currently share equal time; they are not aligned to individual sentences. Uploaded audio is not automatically transcribed or translated: import an SRT file for it. ElevenLabs-generated narration supplies its own subtitle timing.

## Quick start

Install **Node.js 22.12+** (Node 24 recommended) and **FFmpeg/FFprobe** with libass subtitles support and DejaVu fonts.

```bash
git clone https://github.com/abdulrahman198/Reel-engine-ai.git
cd Reel-engine-ai
npm ci
cp .env.example .env
npm run build
npm start
```

Open **http://localhost:8787**. On Windows PowerShell use `Copy-Item .env.example .env` instead of `cp`.

No provider keys are required to create a demo plan, upload your own media and export an MP4. On Debian/Ubuntu the media dependencies can be installed with:

```bash
sudo apt-get install ffmpeg fonts-dejavu-core
```

For development, `npm run dev` starts both the API and Vite; open the Vite URL printed in the terminal. `npm run server` and `npm run dev:client` also work separately. The Vite proxy sends `/api` requests to the configured API port.

## Provider setup

Edit `.env` **on the machine running the server**, then restart it:

```dotenv
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5.6-luna
OPENAI_IMAGE_MODEL=gpt-image-2
IMAGE_QUALITY=low
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
ELEVENLABS_MODEL=eleven_multilingual_v2
```

Select a voice using **Load my voices**, enter a voice ID, or configure `ELEVENLABS_VOICE_ID`. Account access and provider charges apply to real generation. A ChatGPT/ElevenLabs plugin connection does not automatically supply API credentials to this standalone application. Never put provider secrets in `VITE_` variables or commit `.env`.

The server checks required media tools before requesting paid narration. A failing provider request returns an error; it is not presented as successful generation. Demo assets remain visibly labelled.

## Make a video

1. Describe the idea and choose the video language, length and aspect ratio.
2. Generate a plan, or import a previously exported plan JSON.
3. Edit the script and on-screen text. Upload one image per scene or generate the images.
4. Upload narration or generate it with ElevenLabs. Optionally import an SRT file; it takes priority over generated subtitles.
5. Choose the export quality and render. You can preview and download the resulting MP4.

Plans are 30, 45 or 60 seconds. Longer narration/subtitles can extend the output so content is not cut off (audio/SRT inputs up to 180 seconds). Images are cropped to fill the selected aspect ratio. Scene timing shown in the editor describes the original plan.

## Storage and access

Projects, media and job results live in `data/` (or `DATA_DIR`). Back up the **entire** directory, not just project JSON. Deleting a project keeps its media because another project may reference it. Exported plan JSON contains text and settings, not image/audio/video files.

This is a **local/private single-user application**, not a public multi-user service. The default server binds to `127.0.0.1`. Host and browser-origin checks reject unrelated origins. For a private reverse proxy, configure `FRONTEND_ORIGIN` and put authentication at the proxy before exposing the app. Do not expose it directly to the public internet: anyone with API access would be able to access projects and use configured provider keys.

The connection panel reports FFmpeg and provider readiness. Set `FFMPEG_BIN` and `FFPROBE_BIN` if they are not on PATH. The browser never receives API keys.

## Docker option

With Docker and Compose installed:

```bash
cp .env.example .env
docker compose up --build -d
```

Open http://localhost:8787. Compose exposes the port on localhost only and stores projects in the `reel-data` volume. Avoid `docker compose down -v` if you want to preserve that data. Docker packaging is included; validation of this release used the direct Node/FFmpeg installation.

## Verification

```bash
npm test
npm run build
npm run test:render
```

The regular suite covers API validation, project persistence, media uploads, SRT timing, credential redaction, origin/host restrictions, provider mocks and restart recovery. The render suite uses real FFmpeg/FFprobe, including Arabic/German captions, Full HD portrait export, landscape export, narration duration, downloads and byte-range playback. It does not make paid requests.

See [VALIDATION.md](VALIDATION.md) for the release checks and limits.

## Main API routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Provider and media-tool readiness |
| `POST /api/generate` | Script and scene plan |
| `GET/POST /api/projects` | List/create projects |
| `GET/PUT/DELETE /api/projects/:id` | Read/save/delete a project |
| `GET /api/voices` | Account voice choices (first 100) |
| `POST /api/voice` | Narration plus provider-timed subtitles |
| `POST /api/images` | Queue scene image generation |
| `POST /api/assets/image` | Raw image upload, up to 15 MB |
| `POST /api/assets/audio` | Raw audio upload, up to 20 MB |
| `POST /api/assets/captions` | JSON `{ "srt": "..." }`, up to 50 KB |
| `POST /api/render` | Queue an MP4 export |
| `GET /api/jobs/:id` | Job progress/results |
| `GET /api/jobs/:id/video` | MP4 stream; `?download=1` downloads |

Provider references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [ElevenLabs speech with timing](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).
