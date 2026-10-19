import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { watch: { ignored: ['**/.tools/**', '**/.network-test/**', '**/examples/**', '**/docs/**', '**/test-results/**', '**/playwright-report/**', '**/tests/fixtures/**'] } },
});
