/**
 * 控件注册表（工单 09）：FieldControl → 组件。模块级纯常量，组件对象经
 * markRaw（官方点名的 "should not be made reactive" 用例）——注册表永不进
 * reactive，`<component :is>` 动态分发（PropertyField）消费。
 *
 * 两条特殊路由（layer-panel-ux 工票 03）：
 * - pair（两列语义行）仍经本表由 PropertyField 分发，但消费面板下发的
 *   displays（禁用态替代显示）并把子字段提交经 sub-commit 上抛；
 * - anchor（锚点折叠区）是块级字段，不走 PropertyField 的 label+control
 *   行布局——PropertyPanel 按 control === 'anchor' 路径直接渲染本表条目。
 */
import { markRaw, type Component } from 'vue'

import type { FieldControl } from './fieldSchema'
import AlignField from './fields/AlignField.vue'
import AnchorDisclosureField from './fields/AnchorDisclosureField.vue'
import BooleanField from './fields/BooleanField.vue'
import BorderField from './fields/BorderField.vue'
import FontField from './fields/FontField.vue'
import ColorField from './fields/ColorField.vue'
import ImageSrcField from './fields/ImageSrcField.vue'
import NumberField from './fields/NumberField.vue'
import PaddingField from './fields/PaddingField.vue'
import PairField from './fields/PairField.vue'
import SelectField from './fields/SelectField.vue'
import TextField from './fields/TextField.vue'
import TextareaField from './fields/TextareaField.vue'

export const controlRegistry: Record<FieldControl, Component> = {
    number: markRaw(NumberField),
    text: markRaw(TextField),
    textarea: markRaw(TextareaField),
    color: markRaw(ColorField),
    select: markRaw(SelectField),
    boolean: markRaw(BooleanField),
    pair: markRaw(PairField),
    anchor: markRaw(AnchorDisclosureField),
    align: markRaw(AlignField),
    padding: markRaw(PaddingField),
    border: markRaw(BorderField),
    font: markRaw(FontField),
    imageSrc: markRaw(ImageSrcField),
}
