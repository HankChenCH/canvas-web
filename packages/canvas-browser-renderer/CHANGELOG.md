# Changelog

本项目遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## 2.1.0 - 2026-10-21

- 形状能力后端（ADR 0026，可选能力口加法扩展）：新增 `drawEllipse(x, y, width, height, fillColor, stroke)` 椭圆绘制原语——内切椭圆填充与描边一体（`ctx.ellipse` 路径），fill/stroke 一体表达圆形框的背景与圆周环
- 新增 `drawImageMasked(src, srcRect, dstRect, maskRect)` 掩码 blit 原语——双矩形 blit 语义与 `drawImage` 一致（同一收口实现，含整图哨兵；差异仅在掩码裁剪），后以 `maskRect` 内切椭圆裁剪合成（save/clip/restore），掩码外透明
- 两成员齐备即形状能力后端，核心渲染臂（`@hankchen/canvas` ≥2.1）自动探测承接 `spec.clip: "circle"` 圆形档三步分派（椭圆背景 → 遮罩 blit → 圆周描边）；像素取样矩阵与 PHP/Go 同构（四角露下层、圆心为图、环带描边色、非方盒恒正圆、circle × fit 正交、未知值降级矩形）——采样点距圆缘留过渡带余量，缘上抗锯齿像素不保证跨端一致（不在契约内）
- 导出路径自然承载圆形：`forkWith` 复制物化注册与形状能力，`exportPreviewPng` 接线零改动
- 依赖升 `@hankchen/canvas` `^2.1.0`

## 2.0.0 - 2026-10-19

- **Breaking**：`drawImage` 退役五参 cover 签名，改为双矩形 blit 直映射 `drawImage(src, srcRect, dstRect)`（ADR 0024，镜像 js-canvas 核心 v2 渲染契约）——原语零 fit 语义、零内在尺寸读取，四档 fit（cover/contain/fill/tile）几何全在核心渲染臂算定；`srcRect` 零宽高哨兵 = 整图（按注册图片实际尺寸取整，PHP/Go 同门），`dstRect` 宽或高 ≤0 跳过
- **Breaking**：`coverCrop`/`CropWindow` 公共导出退役（fit 几何上移核心 `coverSourceRect`/`tileRects` 纯函数），本包零 fit 几何
- `imageIntrinsicSize` 能力口保留，由「仅 contain 查询」扩为全 fit 前置度量；适配模式 fill/tile 随核心 v2 转正
- 依赖升 `@hankchen/canvas` `^2.0.0`

## 0.1.0 - 2026-10-07

首个公开发布。自 canvas-web workspace 内部包（`@hankchen/canvas-next-browser-renderer`）更名为 `@hankchen/canvas-browser-renderer` 并接入 dist 发布管线（tsup，ESM + dts）；核心契约依赖改为 npm 包 `@hankchen/canvas`。
