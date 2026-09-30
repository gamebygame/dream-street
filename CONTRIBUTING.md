# Contributing

Dream Street is a small, authored experience: a walk down a daylight street while your reflection dances in the shop windows. Contributions are welcome when they serve that experience. For anything larger than a fix, please open an issue first so we can talk about the idea.

## Set up

You need Node 22.12 or later (development uses Node 24) and npm.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`. Add `?debug=1` for beat jumps, contact lines, stem toggles and recording.

## Before you open a pull request

```sh
npm run format:check
npm test
npm run build
npm run test:browser   # uses your local Chrome
```

Motion and music are judged by eye and ear, so passing tests is necessary but not enough.

- **Motion:** with the dev server running, capture the same beats before and after your change and compare them:
  `node scripts/review-frames.mjs --label <name>`. Close-ups keep the production camera angle:
  `?debug=1&inspect=walker|dancer|crowd|cyclist&index=N`. The body-mechanics guards live in `tests/unit/anatomy.test.js`; when you find a new failure, add a check for it there.
- **Music:** render the chapters offline and read the metrics: `node scripts/render-music.mjs --label <name>`. To balance the mix, `node scripts/balance-music.mjs` solos each stem over each chapter.

## House rules

- Everything is a pure function of the beat. `sampleScene`, `wardrobeAt`, `sampleDance`, `crowdState`, `cyclistState` and the score's `notesBetween` must not keep state between calls, so any moment can be seeked to exactly.
- There is one tempo (`CONFIG.bpm`) and one clock (`src/audio/transport.js`); the walker steps on every beat.
- Do not add samples, images, fonts or recordings without recorded provenance and a licence that allows redistribution. List every source in [`docs/ASSETS.md`](docs/ASSETS.md).
- Never commit credentials, personal data, or absolute local paths.
- Pull request titles follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat: …`, `fix: …`, `docs: …`). The maintainer squash-merges pull requests.

## Licence of contributions

By contributing you agree that your code is licensed under the MIT License and your documentation under CC BY 4.0, the same terms as the rest of the project (see [`REUSE.toml`](REUSE.toml)).
