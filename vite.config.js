import { defineConfig } from 'vite';

// Relative asset URLs let the same build run from a project page (gamebygame.github.io/dream-street/) or any
// other subpath, as well as from the local preview server.
export default defineConfig({ base: './' });
