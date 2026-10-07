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
 * - 内容类型 pill + 表达式补全接线（canvas-web-expression-editing 工单 03）：
 *   pill 随编辑会话开合（同 textarea 换算系，激活态随 ui.editing.expression，
 *   切换仅翻会话标志）；补全浮层绑编辑 textarea——enabled = 会话表达式模式
 *   （静态恒闭零配对，pill 切换实时翻转），候选源与面板同源
 *   （expressionCompletionSource ∘ expressionFieldContext：模板格内容 row.
 *   上下文自动正确），锚点测量传画布 zoom 折算；Esc 合流——浮层开着只关浮层
 *   （浮层自身路径），关着才提交；Ctrl/Cmd+Enter 提交优先于候选接受（模板监听
 *   先于 composable 挂载，次序天然成立，mount 测试钉住）。
 */
import { computed, nextTick, ref, watch } from 'vue'

import type { EditorSession } from '@hankchen/canvas-editor'

import ExpressionCompletionPopup from '../shared/ExpressionCompletionPopup.vue'
import { expressionCompletionSource, expressionFieldContext } from '../shared/expressionContext'
import { useExpressionCompletion } from '../shared/useExpressionCompletion'
import ContentTypePill from './ContentTypePill.vue'
import { useTextEditing } from './useTextEditing'

const props = defineProps<{ editor: EditorSession }>()

const rootRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const pillRef = ref<InstanceType<typeof ContentTypePill> | null>(null)
const popupRef = ref<InstanceType<typeof ExpressionCompletionPopup> | null>(null)

const binding = useTextEditing(props.editor, {
    getTextarea: () => textareaRef.value,
    getHost: () => rootRef.value?.parentElement ?? null,
    // pill 与 textarea 同入豁免集（工单 03）：表面组件 pointerdown 命中 pill
    // 不提交不点选
    getPill: () => pillRef.value?.rootEl ?? null,
})

// 顶层解构：模板里自动解包
const { editing, style, composing, pillStyle } = binding
const layout = binding.layout

// pill 激活态与补全 enabled 的单一事实源：内核 textEditLayout.expressionMode
// （会话模式优先，无会话按层标记态回落——工单 01 钉定的消费面）
const expressionMode = computed(() => layout.value?.expressionMode === true)

// 表达式补全（工单 03）：候选源与面板同源——schema/文档/路径在求值时直读会话
// 现态（resolve 每次重算上下文，模板格内容 row. 上下文自动正确），无需额外
// 响应式镜像；enabled 随会话模式翻转（pill 切换 → composable enabled watcher
// 关浮层），静态会话恒闭（零补全零配对，composable 既有语义）
const { popup, accept } = useExpressionCompletion({
    target: textareaRef,
    enabled: expressionMode,
    resolve: (expr) => {
        const schema = props.editor.store.ui.dataSourceSchema
        const path = editing.value
        if (schema === null || path === null) return null
        const source = expressionCompletionSource(schema, expressionFieldContext(schema, props.editor.store.doc, path))
        if (source === null) return null
        return source(expr)
    },
    popupEl: () => popupRef.value?.rootEl ?? null,
    // 锚点折算（spec 决策 6）：画布 textarea 在 transform: scale(zoom) 系
    scale: binding.scale,
})

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
// Enter 与其余键全部走 textarea 默认行为（换行/光标移动），不参与提交。
// Esc 合流（工单 03）：补全浮层开着时 Esc 只关浮层（浮层自身 Esc 路径处理，
// 此处不拦不提交）；Ctrl/Cmd+Enter 恒提交（优先于候选接受——本守卫是 textarea
// 上先注册的监听，先于 composable 的候选接受路径执行）
const onKeyDown = (e: KeyboardEvent) => {
    if (e.isComposing || e.keyCode === 229) return
    const isCommitKey = e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))
    if (!isCommitKey) return
    if (e.key === 'Escape' && popup.open) return
    e.preventDefault()
    binding.commitNow()
}

const onBlur = () => binding.armBlurCommit()

defineExpose({
    /** 双击入口（表面组件转发）：命中 TextLayer 才进入 */
    beginAt: binding.beginAt,
    /** 路径入口（表面组件转发）：已知路径直接进入编辑——画拉建层的文本层
     *  自动进编辑（drag-create 工单 02），内核校验类型 */
    beginTextEdit: binding.beginTextEdit,
    /** 画布点按的显式提交路径（表面组件 pointerdown 调用） */
    commitEditing: () => binding.commitNow(),
    /** 编辑态查询 */
    isEditing: () => editing.value !== null,
    /** 指针目标是否属于编辑中的 textarea 或内容类型 pill（表面组件分流：
     *  两者的指针都归编辑面——textarea 编辑光标、pill 切换，不点选/拖动/提交） */
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
        <!-- 内容类型 pill（工单 03）：随编辑会话开合（与 textarea 同生共死），挂在
             图层框上边框居中（换算在 useTextEditing.pillStyle）；激活态随会话模式，
             切换仅翻会话标志（零文档变更零历史步） -->
        <ContentTypePill
            v-if="editing && pillStyle"
            ref="pillRef"
            :style="pillStyle"
            :mode="expressionMode ? 'expression' : 'static'"
            @change="binding.setExpressionMode($event === 'expression')"
        />
        <!-- 表达式补全浮层（工单 03）：portal 到 body，表达式会话才可开 -->
        <ExpressionCompletionPopup ref="popupRef" :state="popup" @select="accept" />
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
