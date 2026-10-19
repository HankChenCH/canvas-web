# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 2.0.0 - 2026-10-19

- 核心契约代际对齐（ADR 0024）：`@hankchen/canvas` 升 `^2.0.0`（渲染原语双矩形 blit），会话/内核 API 零变化；版本随 canvas-web v2 代际（browser-renderer 后端签名 major 锁步）

## 0.1.0 - 2026-10-07

首个公开发布。自 canvas-web workspace 内部包（`@hankchen/canvas-next-editor`）更名为 `@hankchen/canvas-editor` 并接入 dist 发布管线（tsup，ESM + dts）；核心契约依赖改为 npm 包 `@hankchen/canvas`。
