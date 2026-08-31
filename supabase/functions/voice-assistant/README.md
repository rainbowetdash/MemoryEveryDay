# Voice assistant service configuration

The Edge Function keeps all provider credentials on the server. Never add API keys to `app.js`, `voice-assistant.js`, native projects, or Git.

Required secrets:

- `DEEPSEEK_API_KEY`: enables the DeepSeek option.
- `OPENAI_API_KEY`: enables the ChatGPT option.

Optional model overrides:

- `DEEPSEEK_VOICE_MODEL` (default: `deepseek-v4-flash`)
- `OPENAI_VOICE_MODEL` (default: `gpt-5.6-luna`)

After setting secrets, redeploy `voice-assistant`. The website and installed apps read provider availability dynamically, so they do not need another release.

