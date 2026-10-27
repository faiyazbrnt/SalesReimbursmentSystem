import path from 'path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import fs from 'node:fs';

function resolvePath(basePath: string, subPath: string): string {
  const resolved = path.join(basePath, subPath);
  if (fs.existsSync(resolved)) {
    if (fs.statSync(resolved).isDirectory()) {
      for (const indexFile of ['index.ts', 'index.tsx', 'index.js', 'index.jsx']) {
        const full = path.join(resolved, indexFile);
        if (fs.existsSync(full)) return full;
      }
    }
    return resolved;
  }
  for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
    if (fs.existsSync(resolved + ext)) return resolved + ext;
  }
  return resolved;
}

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/(.*)/,
        replacement: '$1',
        customResolver: (source) => resolvePath(path.join(projectRoot, 'src'), source),
      },
      {
        find: /^@server\/(.*)/,
        replacement: '$1',
        customResolver: (source) => resolvePath(path.join(projectRoot, 'src/server'), source),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 15000,
  },
});
