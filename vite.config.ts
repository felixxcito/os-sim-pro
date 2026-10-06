import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Se optimizan desde el arranque para que abrir una app por primera vez no recargue la página en desarrollo.
  optimizeDeps: {
    include: [
      '@tiptap/react',
      '@tiptap/starter-kit',
      '@tiptap/extension-text-align',
      '@tiptap/extension-text-style',
      '@tiptap/extension-highlight',
      '@tiptap/extension-table',
      '@tiptap/extension-image',
      '@tiptap/extensions',
      'docx',
      'exceljs',
      'mammoth/mammoth.browser.js',
      'recharts',
    ],
  },
});
