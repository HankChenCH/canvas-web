# AGENTS.md — @hankchen/canvas-next-editor

headless 编辑器内核：EditorSession 门面、immer observable store（doc/ui 双分支 + 双栈 undo/redo）、编辑特性模块。运行时仅依赖 immer；无 DOM lib；测试全部 Node 无 DOM 环境。红线见仓库根 `AGENTS.md`。

## Layout（src 分层，2026-09 起）

- `src/session/` — 会话层：editor.ts（EditorSession 门面：注入式帧调度合帧、分层脏标）、store.ts、shortcuts.ts（快捷键注册表）。可引用全部下层域。
- `src/spatial/` — 空间层：camera.ts（视口纯函数）、hitTest.ts、wheel.ts（滚轮意图分类）。
- `src/editing/` — 编辑特性层：clipboard.ts、layerPanel.ts（图层增删移）、tableEditing.ts、fontCatalog.ts、upload.ts。
- `src/shared/` — 纯数据原语，被所有层引用：layerPath.ts（图层路径寻址）、expressionPath.ts（表达式路径解析）+ expressionScan.ts（表达式片段扫描，content-completion 工单 01）。层内仅一条依赖：expressionScan → expressionPath。
- 分层 DAG：`session → {spatial, editing, shared}`、`editing → shared`、`spatial → shared`、`shared → ∅`（层内 scan → path 除外）；下层引用上层被 depcruise `editor-*-isolation` 规则拦截。唯一跨层例外已在 DAG 内（store → camera）。
- `tests/` 与 src 分层镜像；跨包共享 fixture 在 `tests/support/fixtures.ts`（editor-vue 的 mount 测试也引用它，改路径要联动）。

## 纪律

- 内核只保留根 barrel 单出口：EditorSession 门面是宿主唯一 API；域 barrel 仅供根 barrel 汇聚与包内引用，**不开子路径导出**——避免宿主绕过门面拼装内核。
- 对 canvas-next / browser-renderer 的再出口收在根 barrel（绑定层不得直连，见根红线）。
- 加新模块判层：纯数据/路径原语进 shared；空间/拾取类进 spatial；编辑特性进 editing 且只向下依赖；会话编排进 session。新文件只允许向下 import。
- 图层 setter 禁 I/O 的编辑器延伸：物化状态进 store 的 ui 分支，永不写 graph。

## Commands

```sh
pnpm test        # vitest（默认 node 环境，勿装 jsdom）
pnpm typecheck   # tsc --noEmit
```
