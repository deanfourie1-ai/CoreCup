import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Two pages: the app and the sprite lab (paths are relative to the project root).
    rollupOptions: {
      input: {
        main: 'index.html',
        spriteLab: 'sprite-lab.html',
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
