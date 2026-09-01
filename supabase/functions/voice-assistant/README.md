# Voice assistant service configuration

The Edge Function keeps all provider credentials on the server. Never add API keys to `app.js`, `voice-assistant.js`, native projects, or Git.

Required secrets:

- `DEEPSEEK_API_KEY`: enables the DeepSeek option.
- `OPENAI_API_KEY`: enables the ChatGPT option.

Optional model overrides:

- `DEEPSEEK_VOICE_MODEL` (default: `deepseek-v4-flash`)
- `OPENAI_VOICE_MODEL` (default: `gpt-5.6-luna`)
- `OPENAI_TRANSCRIPTION_MODEL` (default: `gpt-4o-mini-transcribe`), used only when a phone has no system speech-recognition service.

Huawei and other Android phones without a system `RecognitionService` automatically fall back to a short browser audio recording. The recording is sent to this Edge Function, transcribed with the server-side OpenAI key, and then passed to the user's selected DeepSeek or ChatGPT planning provider. Audio is limited to 8 MB / about 90 seconds and is not saved to MemoryEveryDay storage.

After setting secrets, redeploy `voice-assistant`. The website and installed apps read provider availability dynamically, so they do not need another release.
