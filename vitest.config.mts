import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijkl.supabase.co',
      TZ: 'UTC',
    },
  },
});
