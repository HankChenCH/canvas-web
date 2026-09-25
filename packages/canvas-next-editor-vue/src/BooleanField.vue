<script setup lang="ts">
/**
 * BooleanField：开关控件（autoWidth/autoHeight/autowrap），shadcn Switch
 * 形态——原生 checkbox（sr-only）+ peer 联动的轨道/滑块，无运行时依赖。
 * 切换走 change 收口（一次切换 = 一步历史）。
 *
 * input 的 checked 需显式回同步 modelValue：内核可能把标志归一回原值（工单 12
 * 的格 autoHeight 采纳语义——开 → 采纳内容高后固化回 false），此时 VDOM 的
 * :checked 值未变（false → false），Vue 不补 DOM 补丁，原生点击留下的 checked
 * 状态会与文档背离；watch 同步保证开关显示恒等于文档。
 */
import { nextTick, ref, watchEffect } from 'vue'

import type { FieldDef } from './fieldSchema'

const props = defineProps<{ field: FieldDef; modelValue: boolean }>()

const emit = defineEmits<{ change: [value: boolean] }>()

const inputRef = ref<HTMLInputElement | null>(null)

/**
 * change 后下一拍回同步：内核可能把标志归一回原值（工单 12 的格 autoHeight 采纳
 * 语义——开 → 采纳内容高后固化回 false），此时 props.modelValue 未变（false →
 * false），VDOM :checked 无 diff、Vue 不补 DOM 补丁，原生点击留下的 checked 与
 * 文档背离；等父级重渲染落定后按文档值拉回。常态切换是幂等回写。
 */
async function onChange(event: Event): Promise<void> {
    emit('change', (event.target as HTMLInputElement).checked)
    await nextTick()
    if (inputRef.value) inputRef.value.checked = props.modelValue
}

// props 驱动的值变更（撤销/重做、切换选中层）走常规响应同步
watchEffect(() => {
    if (inputRef.value) inputRef.value.checked = props.modelValue
})
</script>

<template>
    <label class="cn-bool relative inline-flex h-4 w-7 shrink-0 cursor-pointer items-center">
        <input ref="inputRef" class="cn-bool__input peer sr-only" type="checkbox" :checked="modelValue" @change="onChange" />
        <span
            class="absolute inset-0 rounded-full border border-cn-field-line bg-cn-field transition-colors duration-150 peer-checked:border-cn-accent/60 peer-checked:bg-cn-accent/30 peer-focus-visible:ring-[3px] peer-focus-visible:ring-cn-accent/20"
        ></span>
        <span
            class="relative mx-0.5 size-3 rounded-full bg-cn-muted shadow-sm transition-transform duration-150 peer-checked:translate-x-3 peer-checked:bg-cn-accent"
        ></span>
    </label>
</template>
