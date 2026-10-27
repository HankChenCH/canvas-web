<script setup lang="ts">
/**
 * TextEditingOverlay：文本编辑 textarea overlay（工单 11）。
 *
 * - 渲染在 CanvasSurface 宿主内（与两层 canvas 同一定位上下文），编辑中把
 *   textarea 精确对位到图层盒上（换算与相机跟随在 useTextEditing 的 style 里）；
 * - IME 全交浏览器：composition 事件由 DOM 原生处理，keydown 只在「合成中
 *   （isComposing / keyCode 229）不拦截」的分支上做提交——候选窗里按 Esc/Enter
 *   只操作候选，不误提交不误退出（比 excalidraw 的 Escape 分支多一道守卫）；
 * - 非受控语义：初值在进入编辑时注入一次，此后键入实况只住 textarea；例外是
 *   草稿接管（会话内容独占工单 02）——会话期旁门内容写（查找替换等程序化写）
 *   命中编辑层时全量替换草稿为文档新值（draftSeq 驱动），退出提交仍以 textarea
 *   实况为准；zoom 变更只改样式（防御性保存/恢复 selection，合成中不动——
 *   setSelectionRange 会打断 IME）；
 * - 四条退出路径（Esc / Ctrl+Enter / blur / 点画布他处）经 useTextEditing 收拢
 *   到内核 commitTextEdit 漏斗；暴露给表面组件的 API 供指针桥分流。
 * - 编辑浮层工具条 + 表达式补全接线（canvas-web-edit-overlay-toolbar 工单 03，
 *   原 canvas-web-expression-editing 工单 03 的 pill 面原地演进为工具条首段）：
 *   工具条随编辑会话开合（屏幕恒定尺寸，翻转/钳制换算在 useTextEditing.toolbarStyle，
 *   激活态随 ui.editing.expression，切换仅翻会话标志）；补全浮层绑编辑
 *   textarea——enabled = 会话表达式模式（静态恒闭零配对，工具条切换实时翻转），
 *   候选源与面板同源（expressionCompletionSource ∘ expressionFieldContext：模板
 *   格内容 row. 上下文自动正确），锚点测量传画布 zoom 折算；Esc 合流——浮层开着
 *   只关浮层（浮层自身路径），关着才提交；Ctrl/Cmd+Enter 提交优先于候选接受
 *   （模板监听先于 composable 挂载，次序天然成立，mount 测试钉住）。
 */
import { computed, nextTick, ref, watch } from 'vue'

import type { EditorSession } from '@hankchen/canvas-editor'

import ExpressionCompletionPopup from '../shared/ExpressionCompletionPopup.vue'
import { expressionCompletionSource, expressionFieldContext } from '../shared/expressionContext'
import { useExpressionCompletion } from '../shared/useExpressionCompletion'
import { expressionDiagnosticHint, useExpressionDiagnostics } from '../shared/useExpressionDiagnostics'
import EditOverlayToolbar from './EditOverlayToolbar.vue'
import { useTextEditing } from './useTextEditing'

const props = defineProps<{ editor: EditorSession }>()

const rootRef = ref<HTMLElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const toolbarRef = ref<InstanceType<typeof EditOverlayToolbar> | null>(null)
const popupRef = ref<InstanceType<typeof ExpressionCompletionPopup> | null>(null)

const binding = useTextEditing(props.editor, {
    getTextarea: () => textareaRef.value,
    getHost: () => rootRef.value?.parentElement ?? null,
    // 工具条与 textarea 同入豁免集（工单 03 豁免集扩容）：表面组件 pointerdown
    // 命中工具条任意处不提交不点选不拖动；根元素也是屏幕恒定尺寸的实测面
    getToolbar: () => toolbarRef.value?.rootEl ?? null,
})

// 顶层解构：模板里自动解包
const { editing, style, composing, toolbarStyle, toolbarTagStyle } = binding
const layout = binding.layout

// pill 激活态与补全 enabled 的单一事实源：内核 textEditLayout.expressionMode
// （会话模式优先，无会话按层标记态回落——工单 01 钉定的消费面）
const expressionMode = computed(() => layout.value?.expressionMode === true)

// 表达式语法诊断（expression-syntax-diagnostics 工单 02）：textarea 非受控（值
// 不在 Vue 态）走监听同步；诊断在表达式会话期恒算，汇总文案驱动框顶提示条
const { diagnostics, refresh: refreshDiagnostics } = useExpressionDiagnostics({ target: textareaRef, enabled: expressionMode })
const diagnosticHint = computed(() => (expressionMode.value ? expressionDiagnosticHint(diagnostics.value) : ''))

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
    refreshDiagnostics() // 程序化写值不走 input：诊断显式同步（expression-syntax-diagnostics 工单 02）
    el.focus({ preventScroll: true })
    el.select()
})

// 草稿接管（会话内容独占工单 02，ADR 0019）：会话期旁门内容写（查找替换等程序
// 化写）命中编辑层 → 内核递增 draftSeq，此处全量替换 textarea 草稿为文档新值并
// 刷新表达式诊断——替换结果出现在正在编辑的框里，退出提交仍以草稿为准、任何方向
// 不丢字。pill 翻标志不递增（草稿不动，键入实况保持）。程序化写值不走 input：
// 诊断显式同步（进入编辑同门）。
watch(binding.draftSeq, async () => {
    await nextTick()
    const el = textareaRef.value
    const layout = binding.layout.value
    if (!el || !layout) return
    el.value = layout.text
    refreshDiagnostics()
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
    /** 指针目标是否属于编辑中的 textarea 或整条工具条（表面组件分流：
     *  两者的指针都归编辑面——textarea 编辑光标、工具条样式段点按，
     *  不点选/拖动/提交） */
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
        <!-- 编辑浮层工具条（工单 03 骨架 + 工单 04 五组样式段；edit-toolbar-declutter
             工票 03 下拉化——内容类型下拉与对齐两下拉在工具条内，原 pill 面演进为首
             段下拉）：随编辑会话开合（与 textarea 同生共死），悬挂图层框上缘中点、
             屏幕恒定尺寸（换算在 useTextEditing.toolbarStyle）；显示值全部投影自
             内核 textEditLayout（与面板同源无分叉，字号读数恒场景像素），写入上抛
             updateStyleField（面板同门权威写：updateSpec + sel:path:key mergeKey，
             新层样式槽随权威写自动捕获）；切换仅翻会话标志（零文档变更零历史步） -->
        <EditOverlayToolbar
            v-if="editing && toolbarStyle"
            ref="toolbarRef"
            :style="toolbarStyle"
            :mode="expressionMode ? 'expression' : 'static'"
            :font="layout?.font ?? ''"
            :font-size="layout?.fontSize ?? 16"
            :font-color="layout?.fontColor ?? '#000000'"
            :horizontal-align="layout?.horizontalAlign ?? 'left'"
            :vertical-align="layout?.verticalAlign ?? 'top'"
            :autowrap="layout?.autowrap ?? false"
            @change="binding.setExpressionMode($event === 'expression')"
            @style-write="(w) => binding.updateStyleField(w.key, w.value, w.final)"
        />
        <!-- 表达式语法诊断提示条（expression-syntax-diagnostics 工单 02；锚点改挂
             edit-overlay-toolbar 工单 03）：挂工具条左端外侧、背离图层盒一侧（翻转
             随动），被动展示不劫持指针；提交语义不变（无效表达式仍按内核行为落库，
             标错只解释不阻断） -->
        <span v-if="editing && diagnosticHint" class="cn-text-overlay__diagnostic" :style="toolbarTagStyle">{{
            diagnosticHint
        }}</span>
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

/* 诊断提示条（expression-syntax-diagnostics 工单 02；edit-overlay-toolbar 工单 03
   改挂工具条左端外侧）：与工具条同屏幕恒定系（定位换算在 toolbarTagStyle）。
   用色消费 theme.css 共享令牌（editor-theme spec §2.1 铁律）：底/字走
   --cn-bar-bg/--cn-danger（根类 .cn-text-overlay 在主题消费根类清单内），描边
   取 danger 40% 透明（color-mix 派生随主题换 hue，夜间值同收口前）。 */
.cn-text-overlay__diagnostic {
    position: absolute;
    top: 0;
    left: 0;
    max-width: 240px; /* 屏幕恒定尺寸（随工具条系），超宽省略 */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding: 2px 6px;
    border: 1px solid color-mix(in srgb, var(--cn-danger) 40%, transparent);
    border-radius: 4px;
    background: var(--cn-bar-bg);
    color: var(--cn-danger);
    font-size: 12px;
    line-height: 16px;
    pointer-events: none; /* 被动浮示：不劫持画布指针（不可点选不拦截） */
    user-select: none;
}
</style>
