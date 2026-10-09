# Blue edition update

Implemented corporate cobalt styling, vivid High/Medium/Low badges, 27 original vector icons, an original Earny-inspired rounded illustration, entrance/hover/dialog/recording animations and reduced-motion support.

Replaced the OpenAI integration with configurable Gemini `gemini-3.5-flash-lite`. Added audio upload/preview, browser microphone capture, server audio validation, transcription, editable text review and voice-source metadata. Raw audio is not persisted. Existing summaries, evidence, human approval, duplicate-safe tasks, tracker, progress notes, board, history and exports remain functional.

Your public Firebase Web configuration is included. Auth/Firestore/Admin credentials still require console setup; local sample mode works before that setup. No private key from chat is included or used.

Eleven backend tests, the production build and the desktop/mobile browser workflow passed. Audio UI recognition was mocked. Live Gemini, microphone hardware, Firebase and deployment checks remain for the configured accounts. Follow README.md to enable services, push to GitHub and deploy to Vercel.
