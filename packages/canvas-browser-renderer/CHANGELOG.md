# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 2.0.0 - 2026-10-19

- **Breaking**：`drawImage` 退役五参 cover 签名，改为双矩形 blit 直映射 `drawImage(src, srcRect, dstRect)`（ADR 0024，镜像 js-canvas 核心 v2 渲染契约）——原语零 fit 语义、零内在尺寸读取，四档 fit（cover/contain/fill/tile）几何全在核心渲染臂算定；`srcRect` 零宽高哨兵 = 整图（按注册图片实际尺寸取整，PHP/Go 同门），`dstRect` 宽或高 ≤0 跳过
- **Breaking**：`coverCrop`/`CropWindow` 公共导出退役（fit 几何上移核心 `coverSourceRect`/`tileRects` 纯函数），本包零 fit 几何
- `imageIntrinsicSize` 能力口保留，由「仅 contain 查询」扩为全 fit 前置度量；适配模式 fill/tile 随核心 v2 转正
- 依赖升 `@hankchen/canvas` `^2.0.0`

## 0.1.0 - 2026-10-07

首个公开发布。自 canvas-web workspace 内部包（`@hankchen/canvas-next-browser-renderer`）更名为 `@hankchen/canvas-browser-renderer` 并接入 dist 发布管线（tsup，ESM + dts）；核心契约依赖改为 npm 包 `@hankchen/canvas`。
