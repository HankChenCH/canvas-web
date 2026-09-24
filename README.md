# canvas-web

画布编辑器与前端渲染：graph 契约（与 `php-canvas-next` / `go-canvas` 共享）的 Web 端实现。

## 包结构

| 包 | 职责 |
| --- | --- |
| `@hankchen/canvas-next` | 文档模型：graph 类型与解码校验、画布/图层纯结构、布局纯函数、五原语渲染契约。零 DOM、零运行时依赖 |
| `@hankchen/canvas-next-browser-renderer` | Canvas2D 五原语后端（矩形/图片 cover/文本基线消化、字体与 QR 物化） |
| `@hankchen/canvas-next-editor` | headless 编辑器内核：store、immer patches 双栈历史、工具状态机、选择/视口/命中/吸附。仅依赖 immer |
| `@hankchen/canvas-next-editor-vue` | Vue 3 薄绑定：响应式桥、composables、画布表面组件、属性面板注册表 |
| `playground` | 目验页与开发壳（不发布） |

依赖方向单向：`editor-vue → editor → { canvas-next, browser-renderer }`、`browser-renderer → canvas-next`，
由 tsconfig（结构包无 DOM lib）与 dependency-cruiser 双闸在编译期锁死。

## 开发

```sh
export PATH="$(brew --prefix)/opt/node@22/bin:$PATH"   # Node 22 LTS + pnpm 10（keg-only，同 php@8.3 惯例）
pnpm install
pnpm -r typecheck        # 各包类型检查
pnpm -r test             # 各包测试（内核测试在 Node 无 DOM 环境跑）
pnpm depcruise           # 依赖红线校验
pnpm check:guardrails    # 红线自验：故意违规必须被抓
pnpm --filter playground dev   # 目验壳（http://localhost:5173）
```
