# AGENTS.md — canvas-web

工作区根 `canvas-web/`：graph 契约的 Web 端实现（编辑器 + 浏览器渲染）。独立 git 仓库 + pnpm workspace。
领域词汇与红线沿用上级工作区 `CONTEXT.md` 与根 `AGENTS.md`；spec 在 `.scratch/canvas-web/spec.md`（上级目录）。

## Commands

```sh
export PATH="$(brew --prefix)/opt/node@22/bin:$PATH"   # Node 22 + pnpm 10（keg-only；不导出会用系统 node16/pnpm7）
pnpm install
pnpm -r typecheck
pnpm -r test
pnpm depcruise            # 依赖红线校验
pnpm check:guardrails     # 红线自验（故意违规必须被抓，CI 同款）
pnpm --filter playground dev
```

## Layout

- `packages/canvas-next/` — `@hankchen/canvas-next` 文档模型。**零 DOM、零运行时依赖**。
- `packages/canvas-next-browser-renderer/` — Canvas2D 五原语后端。
- `packages/canvas-next-editor/` — headless 内核，运行时仅依赖 immer。测试全部 Node 无 DOM 环境。
- `packages/canvas-next-editor-vue/` — Vue 3 薄绑定。
- `playground/` — 目验壳（不发布，无单测；验证走 `pnpm --filter playground dev` + `build`）。
- `.dependency-cruiser.cjs` — 依赖红线；`scripts/check-guardrails.sh` — 红线自验金丝雀。

## 红线（双闸，CI 锁死）

1. **依赖方向**：`editor-vue → editor → { canvas-next, browser-renderer }`、`browser-renderer → canvas-next`，
   仅此四条正向边。反向/绕行（如 editor-vue 直接 import canvas-next、任何包依赖根级 `playground/`、内核 import Vue）都被
   dependency-cruiser 拦截；editor 的运行时 npm 依赖仅 immer（`editor-immer-only-npm-deps` 机审）。
   改依赖方向必须同时改 `.dependency-cruiser.cjs` 与对应包 `package.json`。
   注意 playground 位于仓库根 `playground/`（不在 packages/ 下），写规则时 to.path 用 `^playground/`。
2. **无 DOM lib**：`canvas-next`、`editor`（以及暂未用到 DOM 的 `browser-renderer`）tsconfig 不含 `"DOM"` lib——
   `document`/`window` 等宿主类型直接编译报错。浏览器包只有 `editor-vue` 与 `playground`。
   `browser-renderer` 将来需要 Canvas2D 类型时在用到它的文件里局部 `/// <reference lib="dom" />`，不要整体放开 lib。
3. **图层 setter 禁 I/O 的编辑器延伸**：物化状态进内核 store 的 ui 分支，永不写 graph。

## Gotchas

- npm registry：仓库 `.npmrc` 不配镜像（CI 走 npmjs）；本机外网源慢，安装/加依赖时用
  `npm_config_registry=https://registry.npmmirror.com pnpm install` 按次指定（lockfile 不含 registry 主机，产物一致）。
- 包之间**源码直引**（exports 指向 `src/index.ts`），无 dist 构建步骤；`tsc --noEmit` 只做类型检查。
- 内核测试必须在 Node 无 DOM 环境跑（vitest 默认 node 环境即为所需，别装 jsdom）；结构包测试里
  断言"无 DOM"要经 `globalThis` 索引，直接写 `document` 字面量会被无 DOM lib 的 tsconfig 拦下。
- dependency-cruiser 需在 `enhancedResolveOptions` 显式开 `exportsFields: ['exports']`，否则 exports-only
  的包（本仓库四包 + vite 等）解析成 unknown；pnpm 严格隔离下未声明的依赖连 symlink 都没有——
  金丝雀脚本（check-guardrails.sh）靠手动补链接模拟"已声明的错误依赖"来验证方向规则。
- 浏览器基线 = 桌面 evergreen，根 `.browserslistrc` 唯一事实源；playground 构建目标经
  `browserslist-to-esbuild` 接线，调基线只改 `.browserslistrc`。
