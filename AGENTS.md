# AGENTS.md

Instructions for coding agents working in this repository. People should start with [README.md](README.md).

## Commands

- Install: `npm ci` (Node 22.12 or later; development uses Node 24).
- Develop: `npm run dev`, then open `http://127.0.0.1:5173/?debug=1` for beat jumps, contact lines, stem toggles and recording.
- Verify every change: `npm run format:check`, `npm test`, `npm run build`, and `npm run test:browser` (uses the local Chrome).
- Review motion (dev server running): `node scripts/review-frames.mjs --label <name>` writes close-ups and full frames at fixed beats to `artifacts/review/<name>/`. Single close-ups: `?debug=1&inspect=walker|dancer|crowd|cyclist&index=N&zoom=3.6`.
- Review music: `node scripts/render-music.mjs --label <name>` renders each chapter offline to WAV with metrics in `artifacts/music/<name>/`; `node scripts/balance-music.mjs` solos each stem over each chapter.
- Record one cycle with a soak test: `DREAM_STREET_SOAK_SECONDS=180 npm run capture` writes to `artifacts/capture/`.
- Release (maintainer only): `npm version X.Y.Z --no-git-tag-version`; move the CHANGELOG `[Unreleased]` entries under `## [X.Y.Z] - date` and update the link references; merge to `main`; then push an annotated tag `vX.Y.Z`. The Release workflow builds the tag and publishes the release with its assets, so do not create the release by hand.

`artifacts/` is ignored by Git; put evidence there, not in commits.

## Invariants that code must keep

- The scene is a pure function of the beat. `sampleScene`, `wardrobeAt`, `sampleDance`, `crowdState`, `cyclistState` and the score's `notesBetween` keep no hidden state, so seeking to any beat reproduces it exactly.
- There is one tempo (`CONFIG.bpm`, 128) and one clock (`Transport`). The picture samples the AudioContext's output time; `Transport.sample()` only observes and `tick()` is the only place the beat advances. The mixer's latency is measured and notes are scheduled that much earlier.
- The score's chapters are the street's `THEMES`. The four-hit accents (`FOUR_HITS`, beats 50, 52, 54 and 56) are stop-time band hits and must stay the loudest moments of their chapter. Every beat carries an audible pulse.
- Arm IK poles point backward, outward and down (`ELBOW_POLES`). An arm given the knee's forward pole is what produced the "zombie arms"; `tests/unit/anatomy.test.js` guards against it.
- Passers-by who stand wait on a single line (the window line or the wall line), walkers turn back beyond the last of them, and inner slot columns fill first. That is why no one walks through anyone; keep it when you move people.

## Who owns what

- Creative decisions belong to the maintainers:
  - the authored timeline in `src/content/plan.js` (shops, products, chapters, contacts);
  - the choreography in `src/character/pose.js`;
  - the passers-by's street life in `src/content/crowd.js` and the riders in `src/content/cyclists.js`;
  - the score in `src/audio/score.js`.

  Change them only when asked, and name the moment (beat numbers) that changes.
- `docs/INTENT.md` is the intent ledger. Read it before changing motion or music, and add a row when a request changes intent.
- `docs/VERIFICATION.md` records what was actually checked in each round. Never record a check that was not run.
- `docs/ASSETS.md` records every source, reference and dependency with its licence.
- `deploy/worker.js` runs on Cloudflare and serves dream-street.jovipro.com. The maintainer deploys it by hand, so a change there takes effect only after they redeploy it; see `deploy/README.md`.

## Boundaries

- Do not add samples, images, fonts, recordings or third-party code without recorded provenance and a licence that allows redistribution.
- Never commit credentials, personal data or absolute home paths.
- Work on a branch. `main` changes only through a reviewed pull request that the maintainer merges; do not push, merge or change repository settings unless asked.
