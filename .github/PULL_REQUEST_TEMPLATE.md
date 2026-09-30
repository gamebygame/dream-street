## What changes, and why

<!-- The intent behind the change. For motion or music, name the moment (beat numbers) and what should look or sound different. -->

## How it was checked

- [ ] `npm run format:check`, `npm test` and `npm run build` pass
- [ ] `npm run test:browser` passes (local Chrome)
- [ ] Motion: close-up review frames at the same beats before and after (`node scripts/review-frames.mjs --label <name>`)
- [ ] Music: offline renders and metrics (`node scripts/render-music.mjs --label <name>`)
- [ ] New sounds, images or references are recorded with their provenance in `docs/ASSETS.md`

## What still needs a person to watch or listen
