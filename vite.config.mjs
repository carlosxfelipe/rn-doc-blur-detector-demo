import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const webExtensions = [
  '.web.tsx',
  '.web.ts',
  '.web.jsx',
  '.web.js',
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mjs',
  '.json',
];

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'window',
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  resolve: {
    alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
    extensions: webExtensions,
  },
  optimizeDeps: {
    rolldownOptions: {
      resolve: {
        extensions: webExtensions,
      },
    },
  },
});
