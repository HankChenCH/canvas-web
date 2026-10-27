# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 2.2.0 - 2026-10-27

- 编辑器外观（chrome）日间/夜间双主题（editor-theme-light-dark，ADR 0001）：颜色令牌收口单源 `theme.css`——夜间缺省（无信号零回归）+ 日间三信号整组覆盖（`[data-cn-theme='light']` ∥ `[data-theme='light']` ∥ html `light` class；信号只设 html 一处，body portal 浮层经祖先链继承）；信号前缀 `:where()` 零化特异性，宿主在根类上覆盖 `--cn-*` 单令牌的换肤逃生口日夜两态对称
- 新增子路径出口 `./theme.css`（`exports`/`publishConfig.exports`/`build` 三处同步）；`./panel-theme.css` 退化为兼容 shim（`@import './theme.css'`），旧 import 路径不破坏
- 新增 `useCnTheme()`（`./shared` 与根出口）：日间/夜间单例 ref + set/toggle，写出即同步 `data-cn-theme` 到目标元素（缺省 documentElement），可选 storageKey 持久化；document 访问延迟到函数体内（SSR/测试安全）；不监听 `prefers-color-scheme`、无切换动画
- 全外观消费令牌：面板域（含补全/路径选择器两 portal 浮层）、画布域（标尺/右键菜单/查找条/对齐浮条/编辑浮条/拖放提示/参考线族/文本诊断标签）、shared 浮层（Tooltip/DropdownMenu/HelpDialog）与状态栏 scoped 零硬编码色；Tooltip 气泡 portal 根 `.cn-tooltip__bubble` 入枚举清单；投影收口三级（sm/md/lg）+ 模态遮罩 `--cn-backdrop`
- 画笔（gizmo/查找命中/橡皮筋）明暗双态可辨，零改动（spec §6）；结构断言（theme.test.ts）与画布域守卫（theme-canvas.test.ts）锁定「色令牌只出自 theme.css」

## 2.1.0 - 2026-10-21

- 图片属性面板「裁剪形状」二档选择：矩形（缺省，不裁）/圆形（ADR 0026，image-clip-shape 工票 05）——图片组、适配模式之后；仅图片层渲染（IMAGE 区段注册面）；静态声明无表达式态，缺省态经 `layerFieldTarget` 投影回显 rect（fit 缺省投影同门），显式 rect 落领域值（wire 归一不落键归核心 encode）
- 依赖链跟随：`@hankchen/canvas`（经 canvas-editor）升 `^2.1.0`

## 2.0.0 - 2026-10-19

- 图片属性面板「适配」选择扩四档：铺满裁切（cover，缺省）/完整显示（contain）/拉伸铺满（fill）/平铺（tile）（ADR 0024，image-fit 工票 05）；静态声明无表达式态不变，`layerFieldTarget` 缺省投影 cover 回显不变
- 核心契约代际对齐：依赖链升 canvas-web v2 / `@hankchen/canvas` `^2.0.0`；版本随 canvas-web v2 代际

## 0.1.3 - 2026-10-09

- 修正 0.1.2 的 external 策略：`@lucide/vue` 回归内嵌（无响应式状态的图标组件；external 化在 pnpm 严格隔离下宿主无法解析）。仅 `vue` 保持 external。

## 0.1.2 - 2026-10-09

- **修复**：lib mode 构建未把 `vue` / `@lucide/vue` external，整个 Vue runtime 被内嵌进 dist——宿主自带 Vue 时形成双实例，编辑器页渲染槽位时跨实例读 `currentRenderingInstance` 为 null 直接崩溃（`Cannot read properties of null (reading 'ce'/'refs')`）。现在两个依赖显式 external，宿主经 peer/deps 单实例解析。canvas-web 仓内测试与 playground 源码直引单实例，测不出该缺陷；由集成示例（canvas-example）端到端校验发现。

## 0.1.1 - 2026-10-07

- 修复：dist/index.d.ts 的域 barrel 引用（`from './canvas'`）在宿主 TS bundler 解析下被同名域 js 劫持，导致根出口类型符号全部丢失——d.ts 生成时显式补 `/index.js` 后缀消解歧义
- 补 `./package.json` 子路径出口

## 0.1.0 - 2026-10-07

首个公开发布。自 canvas-web workspace 内部包（`@hankchen/canvas-next-editor-vue`）更名为 `@hankchen/canvas-editor-vue` 并接入 dist 发布管线（vite lib mode，ESM + dts，含 .vue SFC 与面板主题 CSS）。
