# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 0.1.1 - 2026-10-07

- 修复：dist/index.d.ts 的域 barrel 引用（`from './canvas'`）在宿主 TS bundler 解析下被同名域 js 劫持，导致根出口类型符号全部丢失——d.ts 生成时显式补 `/index.js` 后缀消解歧义
- 补 `./package.json` 子路径出口

## 0.1.0 - 2026-10-07

首个公开发布。自 canvas-web workspace 内部包（`@hankchen/canvas-next-editor-vue`）更名为 `@hankchen/canvas-editor-vue` 并接入 dist 发布管线（vite lib mode，ESM + dts，含 .vue SFC 与面板主题 CSS）。
