# @hankchen/canvas-editor-vue

[@hankchen/canvas-editor](https://www.npmjs.com/package/@hankchen/canvas-editor) 的 Vue 3 薄绑定：画布表面组件（CanvasSurface）、composables 切片桥、schema 驱动属性面板、图层面板与状态栏。

## 安装

```sh
npm install @hankchen/canvas @hankchen/canvas-editor @hankchen/canvas-editor-vue
```

peerDependencies 要求 `vue ^3.5`。

## 使用

子路径出口：`.`、`./canvas`、`./property-panel`、`./layer-panel`、`./status-bar`、`./shared`、`./panel-theme.css`（面板主题令牌）、`./style.css`（组件样式，需在应用入口以副作用方式引入）。

```ts
import '@hankchen/canvas-editor-vue/panel-theme.css'
import '@hankchen/canvas-editor-vue/style.css'
import { CanvasSurface } from '@hankchen/canvas-editor-vue/canvas'
```

完整目验见 [canvas-web playground](https://github.com/HankChenCH/canvas-web)。
