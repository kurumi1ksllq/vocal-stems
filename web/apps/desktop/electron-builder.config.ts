// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
/**
 * electron-builder 配置。
 *
 * 关键点：
 *   - extraResources 把 runtime/ 整个塞进 resources/runtime
 *     （Python + 权重 + ffmpeg 都在里面，app.asar 只放 JS）
 *   - drizzle 迁移文件也放 resources/drizzle，主进程启动时同步执行
 *   - asar 开着，但 main/preload 的 CJS 已在 dist-electron 里，不需要 unpack
 */
import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'dev.kurumi.vocal-stems',
  productName: '干声分离台',
  copyright: 'Copyright © 2026 kurumi1ksllq',
  directories: {
    output: '../../release',
    buildResources: '../../release/.build',
  },
  files: ['dist/**/*', 'dist-electron/**/*', 'package.json', '!**/*.map', '!**/node_modules/**/*'],
  extraResources: [
    { from: '../../runtime', to: 'runtime', filter: ['**/*'] },
    { from: '../../packages/shared/drizzle', to: 'drizzle', filter: ['**/*'] },
  ],
  win: {
    target: [{ target: 'zip', arch: ['x64'] }],
    // 这里的 ${...} 是 electron-builder 自己的占位符语法，不是 JS 模板字符串
    // biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder 占位符
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  asar: true,
  compression: 'normal',
}

export default config
