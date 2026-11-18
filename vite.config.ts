import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base './' => works on any GitHub Pages repo path; app state lives in ?query params, so no router needed.
export default defineConfig({ base: './', plugins: [react()], test: { include: ['src/**/*.test.ts'] } });
