<script setup lang="ts">
/**
 * PropertyField：单字段的动态分发器——按 FieldDef.control 从注册表取组件，
 * `<component :is>` 渲染。控件的生命周期事件（input 实时 / change 收口）原样
 * 上抛，由 PropertyPanel 统一落 commit（面板零直改）。
 */
import { computed } from 'vue'

import { controlRegistry } from './controls'
import type { FieldDef } from './fieldSchema'

const props = defineProps<{
    field: FieldDef
    /** 字段当前值（面板已用 readField 解析，ok:false 的字段不会渲染到这） */
    value: unknown
}>()

const emit = defineEmits<{ input: [value: unknown]; change: [value: unknown] }>()

const control = computed(() => controlRegistry[props.field.control])
</script>

<template>
    <label class="cn-prop-field">
        <span class="cn-prop-field__label">{{ field.label }}</span>
        <component
            :is="control"
            class="cn-prop-field__control"
            :field="field"
            :model-value="value"
            @input="emit('input', $event)"
            @change="emit('change', $event)"
        />
    </label>
</template>

<style scoped>
.cn-prop-field {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.cn-prop-field__label {
    flex: none;
    width: 62px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: #374151;
}

.cn-prop-field__control {
    flex: 1;
    min-width: 0;
}
</style>
