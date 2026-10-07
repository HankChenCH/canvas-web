# canvas-web

画布编辑器与前端渲染：graph 契约（与 `php-canvas-next` / `go-canvas` 共享）的 Web 端实现。

文档模型核心包 [`@hankchen/canvas`](https://www.npmjs.com/package/@hankchen/canvas) 住在独立的核心仓 [js-canvas](https://github.com/HankChenCH/js-canvas)（无 DOM 世界）；本仓是 DOM 世界——浏览器渲染后端、编辑器与 Vue 绑定，核心经 npm 依赖接入。

## 包结构

| 包 | npm | 职责 |
| --- | --- | --- |
| `packages/canvas-browser-renderer` | [@hankchen/canvas-browser-renderer](https://www.npmjs.com/package/@hankchen/canvas-browser-renderer) | Canvas2D 五原语后端（矩形/图片 cover/文本基线消化、字体与 QR 物化） |
| `packages/canvas-editor` | [@hankchen/canvas-editor](https://www.npmjs.com/package/@hankchen/canvas-editor) | headless 编辑器内核：store、immer patches 双栈历史、工具状态机、选择/视口/命中/吸附。仅依赖 immer |
| `packages/canvas-editor-vue` | [@hankchen/canvas-editor-vue](https://www.npmjs.com/package/@hankchen/canvas-editor-vue) | Vue 3 薄绑定：响应式桥、composables、画布表面组件、属性面板注册表 |
| `playground` | —（不发布） | 目验页与开发壳 |

依赖方向单向：`editor-vue → editor → { canvas, browser-renderer }`、`browser-renderer → canvas`（核心包来自 npm），
由 tsconfig（结构包无 DOM lib）与 dependency-cruiser 双闸在编译期锁死。

## 安装（宿主视角）

```sh
npm install @hankchen/canvas @hankchen/canvas-browser-renderer @hankchen/canvas-editor @hankchen/canvas-editor-vue
```

## 开发

```sh
export PATH="$(brew --prefix)/opt/node@22/bin:$PATH"   # Node 22 LTS + pnpm 10（keg-only，同 php@8.3 惯例）
pnpm install
pnpm -r typecheck        # 各包类型检查
pnpm -r test             # 各包测试（内核测试在 Node 无 DOM 环境跑）
pnpm -r build            # 发布产物管线（tsup ×2 + vite lib mode）
pnpm depcruise           # 依赖红线校验
pnpm check:guardrails    # 红线自验：故意违规必须被抓
pnpm --filter playground dev   # 目验壳（http://localhost:5173）
```
