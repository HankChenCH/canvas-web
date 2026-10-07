<script setup lang="ts">
/**
 * ImageSrcField：图片资源地址控件（imageSrc，静态值上传形态）。
 *
 * 全形态（上传缝在场且非表达式态）：缩略图框（空值 = 上传入口，选文件经内核
 * uploadImage 动作换引用）+ 紧凑路径行（复用 TextField 的 IME 守卫与提交语义，
 * 兼作精确回显与外链/相对路径手写通道）。上传完成以 change 收口提交引用——
 * 走 updateData 字面接管管线，一步历史；失败不上报 change，错误挂入口提示
 * （与 FontField 同门）。降级（无上传缝/canUpload=false）与表达式态退化为纯
 * 路径输入——上传写字面会清表达式标记（字面接管），表达式态不提供上传通道。
 */
import { computed, ref } from 'vue'

import type { ResourceStatus } from '@hankchen/canvas-editor'

import type { FieldDef } from '../fieldSchema'
import { injectImageUpload } from '../imageUpload'
import { uploadFileFromDom } from '../../shared/uploadFile'
import TextField from './TextField.vue'

const props = defineProps<{
    field: FieldDef
    modelValue: string | null
    /** 取值方式（面板按 expression 标记派生）：表达式态走表达式视觉与退化面 */
    dataMode?: 'static' | 'expression'
    /** 当前 src 的物化态（面板从 ui.resourceStatuses 切片解析下发）：角标与画布失败标识同源 */
    resourceStatus?: ResourceStatus
}>()

const emit = defineEmits<{ input: [value: string]; change: [value: string] }>()

const upload = injectImageUpload()

/** 全形态 = 上传缝在场（宿主注入了 uploadHandler）且非表达式态（写引用会字面接管清标记） */
const full = computed(() => upload !== null && upload.canUpload && props.dataMode !== 'expression')

const hasValue = computed(() => typeof props.modelValue === 'string' && props.modelValue !== '')

/** 物化态角标：done 与无记录（宿主未桥接 = 不可知）都不假报 */
const statusBadge = computed(() => {
    if (props.resourceStatus === 'pending') return '装载中'
    if (props.resourceStatus === 'failed') return '失败'
    return null
})

// 上传入口状态：uploading 防连点；失败消息挂入口 title（面板行内不放错误块）
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function onPick(): void {
    uploadError.value = null
    fileInput.value?.click()
}

async function onFileChange(event: Event): Promise<void> {
    const inputEl = event.target as HTMLInputElement
    const file = inputEl.files?.[0]
    inputEl.value = '' // 同一文件可重选
    if (upload === null || !file || uploading.value) return
    uploading.value = true
    try {
        const assetRef = await upload.uploadImage(await uploadFileFromDom(file))
        // null = 内核防御语义（文档未打开不产生上传副作用），不提交
        if (assetRef !== null) emit('change', assetRef)
    } catch (error) {
        uploadError.value = error instanceof Error ? error.message : String(error)
    } finally {
        uploading.value = false
    }
}
</script>

<template>
    <!-- 全形态（静态 + 可上传）：缩略图框 + 路径行；退化为纯路径输入时根 =
         TextField（表达式补全浮层与 cn-field--expression 视觉经 fallthrough
         落到 input——与 FontField 的双根分支同构，PropertyField 的 target 取
         $el 需要 input 根） -->
    <div v-if="full" class="flex flex-col gap-1.5">
        <button
            type="button"
            class="cn-imagesrc__thumb relative flex h-16 w-full items-center justify-center overflow-hidden rounded-md border border-dashed border-cn-field-line bg-cn-field/40 text-[11px] leading-none text-cn-muted transition-colors duration-100 hover:border-cn-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
            :disabled="uploading"
            :title="uploadError ?? (hasValue ? '点击替换图片' : '点击上传图片')"
            :data-upload-error="uploadError ?? undefined"
            @click="onPick"
        >
                <img
                    v-if="hasValue"
                    :src="modelValue ?? undefined"
                    class="absolute inset-0 size-full object-cover"
                    alt=""
                />
            <span
                v-if="statusBadge"
                class="cn-imagesrc__status absolute right-1 top-1 rounded bg-cn-bg-elevated/90 px-1 py-0.5 text-[10px] leading-none"
                :class="resourceStatus === 'failed' ? 'text-red-400' : 'text-cn-muted'"
            >{{ statusBadge }}</span>
            <span v-if="!hasValue" class="relative">{{ uploading ? '…' : uploadError ? '!' : '点击上传图片' }}</span>
        </button>
        <input
            ref="fileInput"
            type="file"
            class="hidden"
            accept="image/*"
            @change="onFileChange"
        />
        <div class="flex items-center gap-1.5">
            <TextField
                class="flex-1"
                :field="field"
                :model-value="modelValue ?? ''"
                :aria-label="field.label"
                @input="emit('input', $event)"
                @change="emit('change', $event)"
            />
            <button
                v-if="hasValue"
                type="button"
                class="cn-imagesrc__clear h-7 shrink-0 rounded-md border border-cn-field-line bg-cn-field px-2 text-[11px] leading-none text-cn-fg transition-colors duration-100 hover:border-cn-muted/40"
                title="清除图片（资源地址置空）"
                @click="emit('change', '')"
            >清除</button>
        </div>
    </div>
    <TextField
        v-else
        :field="field"
        :model-value="modelValue ?? ''"
        :aria-label="field.label"
        @input="emit('input', $event)"
        @change="emit('change', $event)"
    />
</template>
