/**
 * 图层面板域出口：图层面板组件、订阅切片桥（useLayerPanel）与新增菜单数据面
 * （ADD_MENU/ADD_LAYER_MENU——工具栏「＋插入▾」同源消费，editor-top-toolbar 工单 03）。
 */
export { default as LayerPanel } from './LayerPanel.vue'
export { isUpperHalf, useLayerPanel, type LayerPanelBinding } from './useLayerPanel'
export { ADD_LAYER_MENU, ADD_MENU, type AddMenuKind } from './addMenu'
