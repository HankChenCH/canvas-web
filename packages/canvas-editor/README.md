# @hankchen/canvas-editor

headless 编辑器内核：observable store、immer patches 双栈撤销、工具状态机、选择/视口/命中/吸附/物化状态机/剪贴板。唯一 API 是 `EditorSession` 门面（根 barrel 单出口，刻意不开子路径导出）。

## 安装

```sh
npm install @hankchen/canvas @hankchen/canvas-editor
```

运行时依赖仅 `immer`；与 UI 框架解耦——Vue 绑定见 [@hankchen/canvas-editor-vue](https://www.npmjs.com/package/@hankchen/canvas-editor-vue)，浏览器渲染后端见 [@hankchen/canvas-browser-renderer](https://www.npmjs.com/package/@hankchen/canvas-browser-renderer)。

## 依赖边界

内核只依赖 `@hankchen/canvas`（文档模型）与 `@hankchen/canvas-browser-renderer`（视口感知后端类型），由 dependency-cruiser 在 CI 锁死；宿主不得绕过内核直连底层包（再出口收在根 barrel）。
