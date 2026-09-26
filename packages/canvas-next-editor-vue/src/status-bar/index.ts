/**
 * 状态栏域出口：缩放/选中路径/物化进行数展示（物化计数经宿主注入，红线禁
 * 直连 browser-renderer）与图层路径展示格式化。
 */
export { formatLayerPath } from './layerPathLabel'
export { default as StatusBar } from './StatusBar.vue'
