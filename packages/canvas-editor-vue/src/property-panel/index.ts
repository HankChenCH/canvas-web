/**
 * 属性面板域出口：schema 驱动面板——字段描述注册表（fieldSchema）与领域类型、
 * 面板组件与动态控件分发器、面板订阅切片桥（usePropertyPanel）、动态控件
 * 注册表（controls）、Tailwind 类名常量（controlStyles，包内私有）、图片上传
 * 注入缝（imageUpload）。字段控件集见 ./fields。字体清单注入缝（fontPicker）
 * 已迁 shared 域（edit-overlay-toolbar 工单 04，画布工具条同源消费）——此处
 * 具名转发保持既有出口面不变。
 */
export {
    CANVAS_FIELD_SECTIONS,
    FIELD_SECTIONS_BY_TYPE,
    fieldSectionsForPath,
    fieldSectionsForType,
    layerRoleAt,
    readField,
    type FieldControl,
    type FieldDef,
    type FieldReadResult,
    type FieldSection,
    type LayerRole,
} from './fieldSchema'
export { controlRegistry } from './controls'
export { FONT_PICKER_KEY, injectFontPicker, type FontPickerContext } from '../shared/fontPicker'
export { IMAGE_UPLOAD_KEY, injectImageUpload, type ImageUploadContext } from './imageUpload'
export { usePropertyPanel, type PropertyPanelBinding } from './usePropertyPanel'
export { default as PropertyField } from './PropertyField.vue'
export { default as PropertyPanel } from './PropertyPanel.vue'
