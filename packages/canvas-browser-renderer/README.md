# @hankchen/canvas-browser-renderer

[@hankchen/canvas](https://www.npmjs.com/package/@hankchen/canvas) 的浏览器渲染后端：Canvas2D 五原语（矩形 / 图片 cover / 文本基线消化 / 字体与 QR 物化）与 `exportPng` 导出。

## 安装

```sh
npm install @hankchen/canvas @hankchen/canvas-browser-renderer
```

## 使用

```ts
import { decodeGraph } from '@hankchen/canvas'
import { Canvas2DBackend, exportPreviewPng } from '@hankchen/canvas-browser-renderer'
```

五原语渲染契约与自定义渲染端见核心包；编辑器与 Vue 绑定见 [canvas-web 仓](https://github.com/HankChenCH/canvas-web)。

## 环境要求

浏览器环境（Canvas2D + DOM 图片/字体加载）。文本渲染建议提供真实 TTF/TTC 字体资源。
