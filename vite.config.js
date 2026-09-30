import { defineConfig } from 'vite';

// Relative asset URLs let the same build run from its own domain (dream-street.jovipro.com), from a project page
// such as gamebygame.github.io/dream-street/, or from the local preview server.
export default defineConfig({ base: './' });
