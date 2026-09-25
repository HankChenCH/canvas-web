/**
 * 控件注册表（工单 09）：FieldControl → 组件。模块级纯常量，组件对象经
 * markRaw（官方点名的 "should not be made reactive" 用例）——注册表永不进
 * reactive，`<component :is>` 动态分发（PropertyField）消费。
 */
import { markRaw, type Component } from 'vue'

import type { FieldControl } from './fieldSchema'
import AnchorField from './AnchorField.vue'
import BooleanField from './BooleanField.vue'
import BorderField from './BorderField.vue'
import ColorField from './ColorField.vue'
import NumberField from './NumberField.vue'
import PaddingField from './PaddingField.vue'
import SelectField from './SelectField.vue'
import TextField from './TextField.vue'
import TextareaField from './TextareaField.vue'

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
}
