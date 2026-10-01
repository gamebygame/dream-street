# Changelog

All notable changes to Dream Street are documented here. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/). Versions before 0.6.0 were not tagged.

## [Unreleased]

## [0.6.0] - 2026-10-01

### Added

- Passers-by are street life before they join. They browse shop windows, wait at the first crossroad, chat by the wall, walk down the pavement the other way, or cross from the side street, and only turn and walk into their places when the walker comes near.
- The morning cyclist rides out of a side street and leads the way; the afternoon cyclist rides toward the walker and turns back beside him.
- Open-source groundwork: the MIT licence for code and CC BY 4.0 for documentation (REUSE), a contributing guide, a security policy, a code of conduct, agent instructions, an English README with a Simplified Chinese mirror, CI, and a GitHub Pages deployment.
- Dream Street is public under the gamebygame organisation and is served at two addresses: <https://dream-street.jovipro.com/> and <https://gamebygame.github.io/dream-street/>. GitHub Pages keeps the github.io address, so it does not depend on the domain. A small Cloudflare Worker (`deploy/`) serves the same build under the jovipro name.

### Changed

- The original score is now a small rock band in the spirit of Michael Jackson and Queen, played clean in the manner of 1970s rock, on the same four chapters:
  - a dry kit with modelled bronze cymbals instead of drum-machine metal;
  - bass;
  - doubled rhythm guitars from a plucked-string model through a crunchy rather than high-gain amp;
  - lead guitar and piano.

  Only a few parts play at once, and drum fills lead into every chapter.
- The mixer's stems are drums, bass, guitar, keys, lead and crowd, with a small room and light bus glue.

### Removed

- The electronic score's sidechain pumping, octave bass, saw plucks, glockenspiel, clav, supersaw stabs, tuba, risers and sub impacts.
- Synthetic choir, tambourine, cymbal rolls, reversed cymbals and drum-machine hand claps.

### Security

- The security policy says what the hosts see. GitHub Pages logs visitors' IP addresses, and Cloudflare serves the jovipro address with its analytics beacon turned off.

## 0.5.0 - 2026-09-28

### Changed

- An original score at 128 BPM replaces the reference-driven clock. The Sea Power recording remains an optional comparison that is not synchronised.
- The walk swings its arms on natural joint arcs.

### Fixed

- "Zombie arms": arm IK bends elbows backward, outward and down instead of in the knee's forward direction.
- The four-hit phrase is restored: each garment is complete and the hands are free before its accent.
- The mix chain's own latency is measured and compensated, so sound lands on the beat that is shown.

## 0.4.0 - 2026-09-09

### Added

- The full street experience (iterations G2, G2.1 and G2.2): a 256-beat looping street with nine kinds of shops, four performance chapters, 36 passers-by and two cyclists, props with their own gestures, and cloth light on garment changes.

## 0.1.0 - 2026-09-08

### Added

- The G0 and G1 prototype: the fixed street camera, the walker and his single reflection sharing one anchor, clipping by the glass, and the four-hit memory.

[Unreleased]: https://github.com/gamebygame/dream-street/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/gamebygame/dream-street/releases/tag/v0.6.0
