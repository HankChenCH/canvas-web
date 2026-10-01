<script setup lang="ts">
/**
 * FindBar：画布顶部居中浮动查找条（canvas-web-find-replace 工单 03，spec 决策 5）。
 *
 * - 渲染在 CanvasSurface 宿主内（与两层 canvas 同一定位上下文，ContextMenu
 *   同位先例），自带主题令牌块不依赖宿主接线；开合随内核查找会话
 *   （ui.find.open——⌘F 经 useShortcuts 桥 → 内核 findReplace → beginFind，
 *   本组件只做会话态的响应式呈现，Esc 关闭归本组件调 closeFind）；
 * - 输入即扫：两输入直写内核（setFindQuery/setFindReplacement），命中列表
 *   派生不驻留（useFindSession 快照投影），计数「第 x/N 处」随派生与游标联动，
 *   全部替换后「已替换 N 处」瞬时反馈（查询词变更或关闭即清）；
 * - Enter=下一处 / Shift+Enter=上一处（两输入一致）；导航 = setFindCursor +
 *   setSelection + panToBox 视口跟随（spec 决策 6，保 zoom 出视才动——内核
 *   panToBox 语义）；替换成功后跟随新当前命中（内核游标原地指向下一处）；
 * - 重复 ⌘F 重新聚焦查询框：仅当焦点不在输入框（editableTarget 让路口径——
 *   焦点在输入框/按钮时整组让路给浏览器，桥的窗口监听已短路）。聚焦监听挂
 *   window、open 门卫，组件卸载即摘；
 * - Esc 两路关闭：输入框内由本组件键面直关；焦点漂出输入框（点画布等）由
 *   CanvasSurface 窗口级 Escape 监听转发 close（ContextMenu 同款浮层协议）。
 * - 可用态按命中数与游标裁剪：无命中四钮全禁；首处禁上一处、末处禁下一处。
 *   文本编辑态点按钮先经 textarea blur 提交（既有漏斗，无新语义，spec 只注记）。
 */
import { ChevronDown, ChevronUp } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { EditorSession } from '@hankchen/canvas-next-editor'

import { isEditableEventTarget } from '../shared/editableTarget'
import PanelIcon from '../shared/PanelIcon.vue'
import { useFindSession } from './useFindSession'

const props = defineProps<{ editor: EditorSession }>()

const { open, query, replacement, matches, cursor } = useFindSession(props.editor)

const queryInput = ref<HTMLInputElement | null>(null)
/** 全部替换的瞬时反馈（已替换 N 处）；查询词变更或关闭即清 */
const replacedNote = ref<string | null>(null)

/** 计数文案：空 query 留空（初态空转）、未命中「无结果」、其余「第 x/N 处」 */
const count = computed(() => {
    const total = matches.value.length
    if (total === 0) return query.value === '' ? '' : '无结果'
    return `第 ${cursor.value + 1}/${total} 处`
})

const canNav = computed(() => matches.value.length > 0)
const canPrev = computed(() => canNav.value && cursor.value > 0)
const canNext = computed(() => canNav.value && cursor.value < matches.value.length - 1)

/** 导航视口跟随（spec 决策 6）：当前命中选中 + 保 zoom 平移入视（盒在视内不动） */
function followHit(index: number): void {
    const hit = matches.value[index]
    if (!hit) return
    props.editor.setSelection(hit.path)
    const box = props.editor.layerBoxAt(hit.path)
    if (box) props.editor.panToBox(box)
}

function nav(delta: number): void {
    const total = matches.value.length
    if (total === 0) return
    const next = Math.min(Math.max(cursor.value + delta, 0), total - 1)
    props.editor.setFindCursor(next)
    followHit(next)
}

/** 替换当前处：内核游标原地指向下一处（派生列表被替换处缩一位），跟随之 */
function onReplace(): void {
    if (!props.editor.replaceOne()) return
    followHit(cursor.value)
}

/** 全部替换：单事务一步历史；应用处数进瞬时反馈 */
function onReplaceAll(): void {
    const applied = props.editor.replaceAll()
    if (applied === 0) return
    replacedNote.value = `已替换 ${applied} 处`
    followHit(cursor.value)
}

function close(): void {
    props.editor.closeFind()
    replacedNote.value = null
}

/** 输入框键面：IME 合成中放行（候选窗里按 Enter/Esc 只操作候选）；Esc 关闭、
 *  Enter/Shift+Enter 导航（两输入一致） */
function onKeydown(e: KeyboardEvent): void {
    if (e.isComposing || e.keyCode === 229) return
    if (e.key === 'Escape') {
        e.preventDefault()
        close()
        return
    }
    if (e.key === 'Enter') {
        e.preventDefault()
        nav(e.shiftKey ? -1 : 1)
    }
}

function onQueryInput(e: Event): void {
    props.editor.setFindQuery((e.target as HTMLInputElement).value)
}

function onReplacementInput(e: Event): void {
    props.editor.setFindReplacement((e.target as HTMLInputElement).value)
}

// 开条即聚焦查询框（⌘F 的查找意图；已开态挂载同门）。flush post：v-if 渲染
// 完成后焦点才可用。preventScroll 不拽动页面。
watch(
    open,
    (isOpen) => {
        if (isOpen) queryInput.value?.focus({ preventScroll: true })
    },
    { immediate: true, flush: 'post' },
)

// 重复 ⌘F 重新聚焦（spec 决策 5）：会话已开时内核 beginFind 值等短路零通知，
// 聚焦语义归面板——仅当焦点不在输入框（焦点在输入框/按钮时整组让路给浏览器，
// 与桥分类器 editableTarget 同一口径，本监听不拦默认行为）。
function onWindowKeydown(e: KeyboardEvent): void {
    if (!open.value) return
    if (e.key !== 'f' || !(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
    if (isEditableEventTarget(e.target)) return
    queryInput.value?.focus({ preventScroll: true })
}
window.addEventListener('keydown', onWindowKeydown)
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))

// 查询词变更（输入/替换后重扫）即撤上一次的替换计数反馈
watch(query, () => {
    replacedNote.value = null
})

defineExpose({
    /** 表面组件转发关闭路径（CanvasSurface 窗口级 Escape 协议，ContextMenu 同款：
     *  焦点已漂出输入框时 Esc 经窗口监听到达这里） */
    close,
})
</script>

<template>
    <div
        v-if="open"
        class="cn-find-bar"
        data-find-bar
        role="search"
        aria-label="查找替换"
        @pointerdown.stop
    >
        <input
            ref="queryInput"
            class="cn-find-bar__input"
            data-find-query
            type="text"
            :value="query"
            placeholder="查找"
            aria-label="查找"
            spellcheck="false"
            autocomplete="off"
            @input="onQueryInput"
            @keydown="onKeydown"
        />
        <input
            class="cn-find-bar__input"
            data-find-replace
            type="text"
            :value="replacement"
            placeholder="替换"
            aria-label="替换"
            spellcheck="false"
            autocomplete="off"
            @input="onReplacementInput"
            @keydown="onKeydown"
        />
        <span class="cn-find-bar__count" data-find-count>{{ count }}</span>
        <span v-if="replacedNote" class="cn-find-bar__note" data-find-note>{{ replacedNote }}</span>
        <button
            type="button"
            class="cn-find-bar__key"
            data-find-prev
            :disabled="!canPrev"
            title="上一处（Shift+Enter）"
            aria-label="上一处"
            @click="nav(-1)"
        >
            <PanelIcon :icon="ChevronUp" />
        </button>
        <button
            type="button"
            class="cn-find-bar__key"
            data-find-next
            :disabled="!canNext"
            title="下一处（Enter）"
            aria-label="下一处"
            @click="nav(1)"
        >
            <PanelIcon :icon="ChevronDown" />
        </button>
        <button
            type="button"
            class="cn-find-bar__action"
            data-find-replace-one
            :disabled="!canNav"
            title="替换当前处"
            @click="onReplace"
        >
            替换
        </button>
        <button
            type="button"
            class="cn-find-bar__action"
            data-find-replace-all
            :disabled="!canNav"
            title="全部替换"
            @click="onReplaceAll"
        >
            全部替换
        </button>
    </div>
</template>

<style scoped>
/* 令牌与 AlignFloatBar 同值：浮条自带主题（暗色检视面），不依赖宿主接线。
   定位画布顶部居中（工单 03），z 序低于右键菜单（30）。 */
.cn-find-bar {
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-field-line: #2a3a57;
    --cn-accent: #38bdf8;
    --cn-hover: #16223a;

    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: rgb(11 18 32 / 0.92);
    border: 1px solid var(--cn-field-line);
    border-radius: 9px;
    box-shadow: 0 10px 26px rgb(0 0 0 / 0.45);
    backdrop-filter: blur(4px);
    color: var(--cn-fg);
    user-select: none;
}

.cn-find-bar__input {
    width: 132px;
    padding: 4px 8px;
    border: 1px solid var(--cn-field-line);
    border-radius: 6px;
    background: rgb(11 18 32 / 0.9);
    color: var(--cn-fg);
    font-size: 13px;
    line-height: 1.4;
}

.cn-find-bar__input::placeholder {
    color: var(--cn-muted);
}

.cn-find-bar__input:focus {
    outline: none;
    border-color: var(--cn-accent);
}

.cn-find-bar__count {
    min-width: 56px;
    text-align: center;
    color: var(--cn-muted);
    font-size: 12px;
    white-space: nowrap;
}

.cn-find-bar__note {
    color: var(--cn-accent);
    font-size: 12px;
    white-space: nowrap;
}

/* 图标钮（上一处/下一处）与文字钮（替换/全部替换）同族：ghost + hover accent，
   对齐 AlignFloatBar 键位观感 */
.cn-find-bar__key {
    display: grid;
    place-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--cn-fg);
    cursor: pointer;
}

.cn-find-bar__action {
    padding: 4px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--cn-fg);
    font-size: 12px;
    line-height: 1.4;
    cursor: pointer;
}

.cn-find-bar__key:hover:not(:disabled),
.cn-find-bar__action:hover:not(:disabled) {
    background: var(--cn-hover);
    color: var(--cn-accent);
}

.cn-find-bar__key:disabled,
.cn-find-bar__action:disabled {
    color: var(--cn-muted);
    cursor: not-allowed;
}
</style>
