<script setup lang="ts">
/**
 * FontField：字体选择控件（工单 13）。
 *
 * - 宿主注入 fontPicker 缝（FONT_PICKER_KEY）时渲染下拉：内置默认字体 + 字体
 *   清单（内核 FontCatalog：内置清单可配置、自定义上传实时联动）；当前引用不
 *   在清单时原样附加选项（不静默改写文档值）。canUpload 时附本机字体上传：
 *   内核 uploadFont（引用入清单）→ change 收口把引用落到当前文本层，一次上传
 *   = 一步历史。上传失败不上报 change，错误消息挂按钮提示（面板行内不放错误块）。
 * - 未注入：退化为文本输入（原始引用手输）——宿主没接清单/上传也能编辑。
 */
import { computed, ref } from 'vue'

import { injectFontPicker, uploadFileFromDom } from '../fontPicker'
import { fieldBase, textField } from '../controlStyles'
import type { FieldDef } from '../fieldSchema'

const props = defineProps<{ field: FieldDef; modelValue: string }>()

const emit = defineEmits<{ input: [value: string]; change: [value: string] }>()

const picker = injectFontPicker()

/** 下拉选项：内置默认（空引用）+ 清单条目 + 清单外的当前引用原样保留 */
const options = computed(() => {
    if (picker === null) return []
    const list: Array<{ label: string; value: string }> = [{ label: '内置默认字体', value: '' }]
    for (const entry of picker.entries.value) {
        if (entry.ref !== '') list.push({ label: entry.label, value: entry.ref })
    }
    const current = props.modelValue
    if (current !== '' && !list.some((option) => option.value === current)) {
        list.push({ label: `${describeRef(current)}（清单外引用）`, value: current })
    }
    return list
})

/** 引用的展示名：内联数据走语义描述，URL/路径取尾段（避免长串撑爆面板） */
function describeRef(ref: string): string {
    if (ref.startsWith('data:')) return '自定义字体（内联）'
    const tail = ref.split('/').pop()
    return tail ? tail : ref
}

function onSelectChange(event: Event): void {
    emit('change', (event.target as HTMLSelectElement).value)
}

// 退化形态的文本输入：IME 合成中不实时提交（与 TextField 同款守卫）
let composing = false

function onTextInput(event: Event): void {
    if (composing || (event as InputEvent).isComposing) return
    emit('input', (event.target as HTMLInputElement).value)
}

function onCompositionStart(): void {
    composing = true
}

function onCompositionEnd(event: Event): void {
    composing = false
    emit('input', (event.target as HTMLInputElement).value)
}

function onTextChange(event: Event): void {
    composing = false
    emit('change', (event.target as HTMLInputElement).value)
}

/** 上传入口状态：uploading 防连点；失败消息挂按钮 title（不上报 change） */
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function onUploadClick(): void {
    uploadError.value = null
    fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement
    const file = inputEl.files?.[0]
    inputEl.value = '' // 同一文件可重选
    if (picker === null || !file || uploading.value) return
    uploading.value = true
    try {
        const ref = await picker.uploadFont(await uploadFileFromDom(file))
        emit('change', ref)
    } catch (error) {
        uploadError.value = error instanceof Error ? error.message : String(error)
    } finally {
        uploading.value = false
    }
}
</script>

<template>
    <!-- 退化形态：宿主未注入清单缝 → 文本输入（原始引用手输，与 TextField 同款） -->
    <input
        v-if="picker === null"
        class="cn-field"
        :class="textField"
        type="text"
        :value="modelValue"
        @input="onTextInput"
        @compositionstart="onCompositionStart"
        @compositionend="onCompositionEnd"
        @change="onTextChange"
    />
    <div v-else class="flex flex-1 items-center gap-1.5">
        <select class="cn-field cn-select" :class="fieldBase" :value="modelValue" @change="onSelectChange">
            <option v-for="option in options" :key="option.value" :value="option.value">
                {{ option.label }}
            </option>
        </select>
        <input
            ref="fileInput"
            type="file"
            class="hidden"
            accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2"
            @change="onFileChange"
        />
        <button
            v-if="picker.canUpload"
            type="button"
            class="h-7 shrink-0 rounded-md border border-cn-field-line bg-cn-field px-2 text-[11px] leading-none text-cn-fg transition-colors duration-100 hover:border-cn-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="uploading"
            :title="uploadError ?? '上传本机字体（加入清单后可选）'"
            :data-upload-error="uploadError ?? undefined"
            @click="onUploadClick"
        >
            {{ uploading ? '…' : uploadError ? '!' : '上传' }}
        </button>
    </div>
</template>
