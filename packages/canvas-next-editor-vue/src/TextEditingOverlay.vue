<script setup lang="ts">
/**
 * TextEditingOverlay：文本编辑 textarea overlay（工单 11）。
 *
 * - 渲染在 CanvasSurface 宿主内（与两层 canvas 同一定位上下文），编辑中把
 *   textarea 精确对位到图层盒上（换算与相机跟随在 useTextEditing 的 style 里）；
 * - IME 全交浏览器：composition 事件由 DOM 原生处理，keydown 只在「合成中
 *   （isComposing / keyCode 229）不拦截」的分支上做提交——候选窗里按 Esc/Enter
 *   只操作候选，不误提交不误退出（比 excalidraw 的 Escape 分支多一道守卫）；
 * - 非受控语义：初值在进入编辑时注入一次，此后文档/面板改动不回写 textarea，
 *   提交以 textarea 实况为准；zoom 变更只改样式（防御性保存/恢复 selection，
 *   合成中不动——setSelectionRange 会打断 IME）；
 * - 四条退出路径（Esc / Ctrl+Enter / blur / 点画布他处）经 useTextEditing 收拢
 *   到内核 commitTextEdit 漏斗；暴露给表面组件的 API 供指针桥分流。
 */
import { nextTick, ref, watch } from 'vue'

import type { EditorSession } from '@hankchen/canvas-next-editor'

import { useTextEditing } from './useTextEditing'

const props = defineProps<{ editor: EditorSession }>()

const rootRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)

const binding = useTextEditing(props.editor, {
    getTextarea: () => textareaRef.value,
    getHost: () => rootRef.value?.parentElement ?? null,
})

// 顶层解构：模板里自动解包
const { editing, style, composing } = binding

// 进入编辑：挂载后注入初值并聚焦全选（双击进入 = 重写入口，与主流编辑器同款；
// 细粒度光标由后续点击/键盘接管）。preventScroll：画布外图层进入编辑不拽动页面。
watch(editing, async (path) => {
    if (!path) return
    await nextTick()
    const el = textareaRef.value
    const layout = binding.layout.value
    if (!el || !layout) return
    el.value = layout.text
    el.focus({ preventScroll: true })
    el.select()
})

// zoom/相机变化只改样式（元素不重建）；防御性保存/恢复 selection——样式重排后
// selectionStart/End 理论不变，个别内核/旧版会抖动（研究文档 §2.4 已核实的坑）。
// 进入编辑（oldStyle 为 null）不恢复：此刻的 selection 归入口 watch（聚焦/全选），
// 过早恢复会把全选打回光标态。合成中跳过：setSelectionRange 会打断输入法。
watch(style, async (newStyle, oldStyle) => {
    if (!oldStyle || !newStyle) return
    const el = textareaRef.value
    if (!el || composing.value) return
    const start = el.selectionStart
    const end = el.selectionEnd
    await nextTick()
    if (textareaRef.value !== el) return
    if (el.selectionStart !== start || el.selectionEnd !== end) el.setSelectionRange(start, end)
}, { flush: 'post' })

// 提交键守卫：合成中（isComposing / keyCode 229 兼容位）放行给输入法；plain
// Enter 与其余键全部走 textarea 默认行为（换行/光标移动），不参与提交
const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return
    const isCommitKey = e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
    if (!isCommitKey) return
    e.preventDefault()
    binding.commitNow()
}

const onBlur = () => binding.armBlurCommit()

defineExpose({
    /** 双击入口（表面组件转发）：命中 TextLayer 才进入 */
    beginAt: binding.beginAt,
    /** 画布点按的显式提交路径（表面组件 pointerdown 调用） */
    commitEditing: () => binding.commitNow(),
    /** 编辑态查询 */
    isEditing: () => editing.value !== null,
    /** 指针目标是否属于编辑中的 textarea（表面组件分流：textarea 内不点选/拖动） */
    ownsEventTarget: (target: EventTarget | null) => binding.ownsEventTarget(target),
})
</script>

<template>
    <div ref="rootRef" class="cn-text-overlay">
        <textarea
            v-if="editing && style"
            :key="editing.join('\u001f')"
            ref="textareaRef"
            class="cn-text-overlay__textarea"
            :style="style"
            :wrap="style.whiteSpace === 'pre' ? 'off' : 'soft'"
            spellcheck="false"
            autocomplete="off"
            @keydown="onKeyDown"
            @blur="onBlur"
            @compositionstart="binding.setComposing(true)"
            @compositionend="binding.setComposing(false)"
        ></textarea>
    </div>
</template>

<style scoped>
.cn-text-overlay {
    position: absolute;
    inset: 0;
    /* 透明点击面：只有 textarea 本身可交互，画布事件不受阻 */
    pointer-events: none;
}

.cn-text-overlay__textarea {
    position: absolute;
    top: 0;
    left: 0;
    margin: 0;
    border: 0;
    outline: none;
    resize: none;
    overflow: hidden;
    background: transparent;
    /* 盒背景/边框由内容层 canvas 照常绘制（内容层只跳绘文字），textarea 透明叠放 */
    user-select: text;
    pointer-events: auto;
    font-weight: 400;
    font-style: normal;
    letter-spacing: normal;
    text-transform: none;
    padding: 0; /* 实际 padding 由 :style 按图层 shape/对齐注入 */
}
</style>
