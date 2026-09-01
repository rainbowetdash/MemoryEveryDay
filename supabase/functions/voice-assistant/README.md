# Voice assistant service configuration

The Edge Function keeps all provider credentials on the server. Never add API keys to `app.js`, `voice-assistant.js`, native projects, or Git.

Required secrets:

- `DEEPSEEK_API_KEY`: enables the DeepSeek option.
- `OPENAI_API_KEY`: enables the ChatGPT option.

Optional model overrides:

- `DEEPSEEK_VOICE_MODEL` (default: `deepseek-v4-flash`)
- `OPENAI_VOICE_MODEL` (default: `gpt-5.6-luna`)
- `OPENAI_TRANSCRIPTION_MODEL` (default: `gpt-transcribe`), used for high-accuracy bilingual transcription.
- `VOICE_ASSISTANT_UNLIMITED_USER_IDS`: comma-separated MemoryEveryDay user IDs that do not consume the daily quota.

Supported browsers and installed apps prefer a short audio recording so Chinese-English code-switching, course codes, and existing schedule titles can be supplied as transcription hints. Devices that cannot record in the web layer fall back to their system speech recognizer. Audio is limited to 8 MB / about 90 seconds and is not saved to MemoryEveryDay storage.

Chinese transcripts and the resulting schedule, todo, and memo text are normalized to Simplified Chinese before they are returned to the app.

After transcription, the app shows an editable confirmation step. Quota is claimed only after the user confirms creation. Planning requests include a compact 30-day schedule context so references such as “the first task this afternoon” can be resolved without sending event notes or memo content.

After setting secrets, redeploy `voice-assistant`. The website and installed apps read provider availability dynamically, so they do not need another release.
