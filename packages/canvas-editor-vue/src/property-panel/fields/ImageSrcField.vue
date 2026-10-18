<script setup lang="ts">
/**
 * ImageSrcField：图片资源地址控件（imageSrc，静态值上传形态）。
 *
 * 全形态（上传缝在场且非表达式态）：缩略图框（空值 = 上传入口，选文件经内核
 * uploadImage 动作换引用）+ 紧凑路径行（复用 TextField 的 IME 守卫与提交语义，
 * 兼作精确回显与外链/相对路径手写通道）。上传完成以 change 收口提交引用——
 * 走 updateData 字面接管管线，一步历史；失败不上报 change，错误挂入口提示
 * （与 FontField 同门）。源图内在尺寸只读展示随缩略图装载在场（image-fit
 * 工单 05 搭车项：像素 + 宽高比，判断 cover/contain 的直接依据）。
 *
 * 表达式态（resource-expression-single-ref 工单 05，ADR 0020）：资源表达式必须
 * 恰为单个裸路径片段——退化 TextField 换装级联路径选择器（复用 resourceValue
 * 控件的拆装壳：`{{path}}` ⇄ 裸路径，存量违例原文只读回显，菜单点选整值替换；
 * 纯菜单点选不设手输缝）。上传通道在表达式态不存在（写引用会字面接管清标记）。
 * 静态态（缩略图 + 上传 + 路径行）不动。
 */
import { computed, ref, watch } from 'vue'

import type { ResourceStatus } from '@hankchen/canvas-editor'

import type { CompletionSource } from '../../shared/completion'
import type { FieldDef } from '../fieldSchema'
import { injectImageUpload } from '../imageUpload'
import { uploadFileFromDom } from '../../shared/uploadFile'
import { intrinsicSizeLabel } from './intrinsicSize'
import ResourceValueField from './ResourceValueField.vue'
import TextField from './TextField.vue'

const props = defineProps<{
    field: FieldDef
    modelValue: string | null
    /** 取值方式（面板按 expression 标记派生）：表达式态走选择器，静态态走上传形态 */
    dataMode?: 'static' | 'expression'
    /** 当前 src 的物化态（面板从 ui.resourceStatuses 切片解析下发）：角标与画布失败标识同源 */
    resourceStatus?: ResourceStatus
    /** 候选源（面板同款注入缝，PropertyField 经 resource 门下发）；null = 未绑声明只读 */
    source?: CompletionSource | null
    disabled?: boolean
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

// 源图内在尺寸读数（image-fit 工单 05 搭车项）：随缩略图装载自然获得（img 的
// load 事件携带 naturalWidth/Height），src 变更即撤（旧图读数不残留，重装载更新），
// 装载失败不显示。只读展示零提交面
const intrinsic = ref<{ width: number; height: number } | null>(null)
const intrinsicLabel = computed(() =>
    intrinsic.value === null ? null : intrinsicSizeLabel(intrinsic.value.width, intrinsic.value.height),
)

function onThumbLoad(event: Event): void {
    const el = event.target as HTMLImageElement
    intrinsic.value = el.naturalWidth > 0 && el.naturalHeight > 0
        ? { width: el.naturalWidth, height: el.naturalHeight }
        : null
}

watch(() => props.modelValue, () => {
    intrinsic.value = null
})

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
    <!-- 全形态（静态 + 可上传）：缩略图框 + 路径行；表达式态 = 级联路径选择器
         （resourceValue 控件同款拆装壳，无手输缝）；降级（无上传缝/canUpload）
         静态态退化为纯路径输入（TextField 根 = input，外链/相对路径手写通道） -->
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
                    @load="onThumbLoad"
                    @error="intrinsic = null"
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
        <!-- 源图内在尺寸只读展示（image-fit 工单 05 搭车项，ADR 0023）：像素 + 宽高比，
             判断 cover/contain 的直接依据；随缩略图装载在场，降级/表达式形态无读数 -->
        <span
            v-if="intrinsicLabel"
            class="cn-imagesrc__intrinsic text-[11px] leading-4 text-cn-muted"
        >源图 {{ intrinsicLabel }}</span>
    </div>
    <ResourceValueField
        v-else-if="dataMode === 'expression'"
        :field="field"
        :model-value="modelValue"
        data-mode="expression"
        :source="source ?? null"
        :disabled="disabled"
        @input="emit('input', $event)"
        @change="emit('change', $event)"
    />
    <TextField
        v-else
        :field="field"
        :model-value="modelValue ?? ''"
        :aria-label="field.label"
        @input="emit('input', $event)"
        @change="emit('change', $event)"
    />
</template>
