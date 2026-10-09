# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 0.1.2 - 2026-10-09

- **修复**：lib mode 构建未把 `vue` / `@lucide/vue` external，整个 Vue runtime 被内嵌进 dist——宿主自带 Vue 时形成双实例，编辑器页渲染槽位时跨实例读 `currentRenderingInstance` 为 null 直接崩溃（`Cannot read properties of null (reading 'ce'/'refs')`）。现在两个依赖显式 external，宿主经 peer/deps 单实例解析。canvas-web 仓内测试与 playground 源码直引单实例，测不出该缺陷；由集成示例（canvas-example）端到端校验发现。

## 0.1.1 - 2026-10-07

- 修复：dist/index.d.ts 的域 barrel 引用（`from './canvas'`）在宿主 TS bundler 解析下被同名域 js 劫持，导致根出口类型符号全部丢失——d.ts 生成时显式补 `/index.js` 后缀消解歧义
- 补 `./package.json` 子路径出口

## 0.1.0 - 2026-10-07

首个公开发布。自 canvas-web workspace 内部包（`@hankchen/canvas-next-editor-vue`）更名为 `@hankchen/canvas-editor-vue` 并接入 dist 发布管线（vite lib mode，ESM + dts，含 .vue SFC 与面板主题 CSS）。
