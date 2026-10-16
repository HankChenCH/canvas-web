/**
 * 图层面板域出口：图层面板组件、共享模板行路径表单（TemplateTableForm——面板菜单
 * 与工具栏弹层共用，template-table-drag-create 工单 02）、订阅切片桥（useLayerPanel）
 * 与新增菜单数据面（ADD_MENU/ADD_LAYER_MENU——工具栏「＋插入▾」同源消费，
 * editor-top-toolbar 工单 03；面板树形 PANEL_ADD_MENU 挂预设二级，preset-submenu
 * 工单 03 两族预设清单面板专用且只入二级）。
 */
export { default as LayerPanel } from './LayerPanel.vue'
export { default as TemplateTableForm } from './TemplateTableForm.vue'
export { isUpperHalf, useLayerPanel, type LayerPanelBinding } from './useLayerPanel'
export {
    ADD_LAYER_MENU,
    ADD_MENU,
    ADD_RATIO_PRESET_MENU,
    ADD_TEXT_PRESET_MENU,
    PANEL_ADD_MENU,
    type AddMenuKind,
    type AddRatioPresetKind,
    type AddTextPresetKind,
    type PanelAddMenuEntry,
} from './addMenu'
