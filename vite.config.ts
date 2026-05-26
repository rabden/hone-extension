import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

const define = {
  'process.env.NODE_ENV': JSON.stringify('production'),
  'process.env': '{}',
};

export default defineConfig(() => {
  const isBackground = process.env.ENTRY === 'background';
  const isContent = process.env.ENTRY === 'content';
  const isBridge = process.env.ENTRY === 'bridge';

  if (isBridge) {
    return {
      define,
      build: {
        emptyOutDir: false,
        outDir: 'dist',
        lib: {
          entry: resolve(__dirname, 'src/content/main-world-bridge.ts'),
          name: 'bridge',
          formats: ['es'] as import('vite').LibraryFormats[],
          fileName: () => 'main-world-bridge.js',
        },
        minify: false,
      },
    };
  }

  if (isBackground) {
    return {
      define,
      build: {
        emptyOutDir: false,
        outDir: 'dist',
        lib: {
          entry: resolve(__dirname, 'src/background/service-worker.ts'),
          name: 'background',
          formats: ['es'] as import('vite').LibraryFormats[],
          fileName: () => 'background.js',
        },
        minify: false,
      },
    };
  }

  if (isContent) {
    return {
      plugins: [react(), tailwindcss()],
      define,
      build: {
        emptyOutDir: false,
        outDir: 'dist',
        lib: {
          entry: resolve(__dirname, 'src/content/index.tsx'),
          name: 'content',
          formats: ['es'] as import('vite').LibraryFormats[],
          fileName: () => 'content.js',
        },
        minify: false,
      },
    };
  }

  return {
    plugins: [react(), tailwindcss()],
    define,
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          options: resolve(__dirname, 'options.html'),
        },
        output: {
          entryFileNames: '[name].js',
          assetFileNames: 'assets/[name].[ext]',
          chunkFileNames: '[name].js',
        },
      },
      minify: false,
    },
  };
});
