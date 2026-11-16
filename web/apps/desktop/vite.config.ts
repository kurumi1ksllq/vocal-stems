import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'
import { defineConfig, type PluginOption } from 'vite'
import electron from 'vite-plugin-electron/simple'

const root = path.resolve(__dirname)

// 只有 ANALYZE=1 时才挂体积分析，平时不进构建
const analyze = process.env.ANALYZE === '1'

export default defineConfig(({ command }) => {
  const isDev = command === 'serve'

  return {
    root,
    resolve: {
      alias: {
        '@renderer': path.resolve(root, 'src/renderer'),
        '@main': path.resolve(root, 'src/main'),
        '@vs/shared': path.resolve(root, '../../packages/shared/src'),
        '@vs/ui': path.resolve(root, '../../packages/ui/src'),
      },
    },
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler', {}]],
        },
      }),
      tailwindcss(),
      electron({
        main: {
          entry: 'src/main/index.ts',
          vite: {
            build: {
              outDir: 'dist-electron/main',
              // 主进程必须是 CJS：vite 8 用 rolldown，且 Electron 主进程
              // 用 require / __dirname 最省事。这里是 rolldownOptions 不是
              // rollupOptions（vite 8 已把 rollup 换成 rolldown）。
              lib: {
                entry: 'src/main/index.ts',
                formats: ['cjs'],
                // 必须是 .cjs：package.json 有 "type": "module"，
                // 用 .js 会被 Electron 当 ESM 加载，require/__dirname 全炸
                fileName: () => 'index.cjs',
              },
              rollupOptions: {
                output: { format: 'cjs', entryFileNames: '[name].cjs' },
                external: [
                  'electron',
                  'node:sqlite',
                  'node:fs',
                  'node:path',
                  'node:os',
                  'node:child_process',
                  'node:crypto',
                  'node:url',
                  'node:module',
                ],
              },
              minify: false,
              sourcemap: isDev,
            },
          },
        },
        preload: {
          input: path.resolve(root, 'src/preload/index.ts'),
          vite: {
            build: {
              outDir: 'dist-electron/preload',
              lib: {
                entry: path.resolve(root, 'src/preload/index.ts'),
                formats: ['cjs'],
                fileName: () => 'index.cjs',
              },
              rollupOptions: {
                output: { format: 'cjs', entryFileNames: '[name].cjs' },
                external: ['electron'],
              },
              minify: false,
              sourcemap: isDev,
            },
          },
        },
        // 渲染进程不需要 Node 能力，renderer 插件关掉
        renderer: undefined,
      }),
      analyze &&
        (visualizer({
          filename: 'dist/stats.html',
          template: 'raw-data',
          gzipSize: true,
          brotliSize: true,
        }) as PluginOption),
    ].filter(Boolean) as PluginOption[],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: isDev,
      rollupOptions: {
        input: path.resolve(root, 'index.html'),
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5273,
      strictPort: true,
    },
    clearScreen: false,
  }
})
