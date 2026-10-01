import { defineConfig } from 'vite';

// Relative asset URLs let one build run at gamebygame.github.io/dream-street/ (a project page), at the root of
// dream-street.jovipro.com (the same files through the Worker in deploy/), and on the local preview server.
export default defineConfig({ base: './' });
