// 预加载脚本（CommonJS）
//
// 必须用 .cjs：package.json 里有 "type": "module"，.js 会被当 ESM，
// 而 Electron 的 preload 必须能 require。//
// 渲染进程目前完全通过 HTTP 和后端通信，不需要任何 Node 能力。
// 这里只暴露一个最小的环境标记，方便前端区分「跑在桌面应用里」还是浏览器里。
// contextIsolation 开着，所以必须用 contextBridge，不能直接挂 window。

const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('vocalStems', {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
})
