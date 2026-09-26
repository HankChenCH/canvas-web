/**
 * 控件注册表（工单 09）：FieldControl → 组件。模块级纯常量，组件对象经
 * markRaw（官方点名的 "should not be made reactive" 用例）——注册表永不进
 * reactive，`<component :is>` 动态分发（PropertyField）消费。
 */
import { markRaw, type Component } from 'vue'

import type { FieldControl } from './fieldSchema'
import AnchorField from './fields/AnchorField.vue'
import BooleanField from './fields/BooleanField.vue'
import BorderField from './fields/BorderField.vue'
import FontField from './fields/FontField.vue'
import ColorField from './fields/ColorField.vue'
import NumberField from './fields/NumberField.vue'
import PaddingField from './fields/PaddingField.vue'
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
    anchor: markRaw(AnchorField),
    padding: markRaw(PaddingField),
    border: markRaw(BorderField),
    font: markRaw(FontField),
}
