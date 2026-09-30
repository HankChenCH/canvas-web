<script setup lang="ts">
/**
 * <LayerPanel>：图层面板（工单 10/12）——树形大纲（根层 = 视觉逆序，表格三层
 * 嵌套展开）、拖动重排（根层走 priority 中点插值 / 行格直接改数组序，两套语义
 * 分立；行可跨表、格可跨行——跨容器落点走内核重建路径同步尺寸）、增删（新增
 * 置顶 min−1、加行/加格走重建路径、删除含子树）、点选/悬停与画布双向联动、
 * 根层行内重命名（工单 09：双击/hover 铅笔/F2 开会话，Enter·失焦提交、Esc
 * 取消，会话与漏斗在内核 ui 分支）。表达式前置（工单 02）：带标记内容层行内
 * 等宽显示闭合片段串——只读 outline 投影字段，面板零计算。
 * 视觉沿用 .cn-props 主题命名空间（与属性面板同一套设计令牌）；行卡片化 +
 * 根层拖拽把手见 panel-theme.css 的 cn-layers 区块（工单 08）。
 *
 * 拖放约定（工单 08 起发起区域分域）：根层拖拽仅从行内六点把手发起（整行
 * draggable 摘除，规避与行选中/双击重命名手势冲突）；行/格保持整行拖拽不加
 * 把手（I2=A 行/格不动）。落点约定两域一致：行上半 = insert-before 当前行、
 * 下半 = insert-after（面板底经最后一行的下半可达）；行落点 = 任意行的行节点
 * （同表重排/跨表移动内核自动分流），格落点 = 任意格节点（同行重排/跨行移动
 * 同款）。内核对原位/相邻落点自动空转（无历史步）。
 */
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'

import { Eye, EyeOff, GripVertical, Lock, LockOpen, Pencil } from '@lucide/vue'

import {
    isTemplateSubtreePath,
    pathsEqual,
    type EditorSession,
    type LayerOutlineNode,
    type LayerPath,
    type LayerType,
} from '@hankchen/canvas-next-editor'

import PanelIcon from '../shared/PanelIcon.vue'
import { isUpperHalf, useLayerPanel } from './useLayerPanel'
const props = defineProps<{ editor: EditorSession }>()

const panel = useLayerPanel(props.editor)

/** 扁平行：大纲树的渲染投影（深度缩进 + 组内序号 + 面板标签） */
interface FlatRow {
    key: string
    node: LayerOutlineNode
    indentLevel: number
    label: string
    /** 组内序号：root = 面板序（内核 moveRootLayer 吃面板坐标）；row = 行数组序；cell = 格数组序 */
    indexInGroup: number
    /** 行节点的宿主表路径（行拖放落点折算 + moveTableRow 入参）；非行 null */
    tablePath: LayerPath | null
    /** 是否落在行模板子树（视觉区分 + 格拖放裁剪，spec §2.2） */
    inTemplate: boolean
    draggable: boolean
}

/** 新增菜单项（spec §2.1）：四类图层直建；模板表带 rowsPath 必填表单 */
type AddMenuKind =
    | { kind: 'layer'; type: LayerType; label: string; title: string }
    | { kind: 'template-table'; label: string; title: string }

const ADD_MENU: readonly AddMenuKind[] = [
    { kind: 'layer', type: 'TextLayer', label: '文本层', title: '新增文本层' },
    { kind: 'layer', type: 'ImageLayer', label: '图片层', title: '新增图片层' },
    { kind: 'layer', type: 'QrCodeLayer', label: '二维码层', title: '新增二维码层' },
    { kind: 'layer', type: 'TableLayer', label: '表格', title: '新增表格层' },
    { kind: 'template-table', label: '模板表', title: '新增模板表（行模板 + 数据行展开）' },
]

/** 新增菜单态：菜单开合 + 模板表 rowsPath 表单（必填校验就地拦，spec §2.1 N1） */
const addMenuOpen = ref(false)
const templateFormOpen = ref(false)
const templateRowsPath = ref('')
const templateRowsPathInvalid = ref(false)

function toggleAddMenu(): void {
    if (addMenuOpen.value) {
        resetAddMenu()
        return
    }
    addMenuOpen.value = true
}

function resetAddMenu(): void {
    addMenuOpen.value = false
    templateFormOpen.value = false
    templateRowsPath.value = ''
    templateRowsPathInvalid.value = false
}

function addLayer(kind: AddMenuKind): void {
    if (kind.kind === 'template-table') {
        templateFormOpen.value = true
        return
    }
    props.editor.addRootLayer(kind.type)
    resetAddMenu()
}

function addTemplateTable(): void {
    const rowsPath = templateRowsPath.value.trim()
    if (rowsPath === '') {
        templateRowsPathInvalid.value = true
        return
    }
    props.editor.addTemplateTable(rowsPath)
    resetAddMenu()
}

/**
 * 显示名（工单 09）：根层 name 非空上屏、空串回退派生标签（`TextLayer 1` 式，
 * 同类计数只数根层出现序，与命名与否无关——计数逻辑不动）；行/格 = 容器内序号；
 * 内容 = type。
 */
function labelFor(node: LayerOutlineNode, typeOrdinal: number): string {
    switch (node.role) {
        case 'root':
            return node.name !== '' ? node.name : `${node.type} ${typeOrdinal}`
        case 'row':
            return `行 ${Number(node.path[node.path.length - 1]) + 1}`
        case 'templateRow':
            // 前缀图标 + 正式名词（术语红线：行模板；spec §2.2 D1）
            return '⌗ 行模板'
        case 'cell':
            return `格 ${Number(node.path[node.path.length - 1]) + 1}`
        case 'content':
            return node.type
    }
}

const flatRows = computed<readonly FlatRow[]>(() => {
    const rows: FlatRow[] = []
    const typeCount = new Map<string, number>()
    function walk(node: LayerOutlineNode, indentLevel: number, indexInGroup: number, tablePath: LayerPath | null): void {
        // 行节点的宿主表 = 去掉尾段 (key, index) 的路径；行模板节点 template 段无
        // 下标（去掉尾段一段）；格/内容继承传入的表路径
        const rowTablePath =
            node.role === 'row'
                ? (node.path.slice(0, -2) as LayerPath)
                : node.role === 'templateRow'
                    ? (node.path.slice(0, -1) as LayerPath)
                    : tablePath
        let ordinal = 0
        if (node.role === 'root') {
            ordinal = (typeCount.get(node.type) ?? 0) + 1
            typeCount.set(node.type, ordinal)
        }
        rows.push({
            key: node.path.join('.'),
            node,
            indentLevel,
            label: labelFor(node, ordinal),
            indexInGroup,
            tablePath: rowTablePath,
            inTemplate: isTemplateSubtreePath(node.path),
            draggable: node.role === 'root' || node.role === 'row' || node.role === 'cell',
        })
        node.children.forEach((child, i) => walk(child, indentLevel + 1, i, rowTablePath))
    }
    panel.outline.value.forEach((root, i) => walk(root, 0, i, null))
    return rows
})

const hasLayers = computed(() => flatRows.value.length > 0)

// ---- 选择/悬停联动（与画布命中共享 ui 分支） ----

function select(row: FlatRow): void {
    props.editor.setSelection(row.node.path)
}

function hover(row: FlatRow | null): void {
    props.editor.setHovered(row === null ? null : row.node.path)
}

// ---- 增删（内核 action：根层新增置顶 min−1；行/格/模板格新增走重建路径；删除含子树） ----

/** 表节点的「加行」：缺省行 + 缺省格（带文本内容），行宽=表宽 */
function addRow(row: FlatRow): void {
    props.editor.addTableRow(row.node.path)
}

/** 行节点的「加格」：缺省格 + 文本内容，行高取最高格 */
function addCell(row: FlatRow): void {
    props.editor.addTableCell(row.node.path)
}

/** 行模板节点的「加格」（spec §3.1）：缺省格 + 文本内容，零高度耦合 */
function addTemplateCell(row: FlatRow): void {
    // 行模板节点路径 ['layers', i, 'template'] → 宿主表路径去掉尾段
    props.editor.addTemplateCell(row.node.path.slice(0, -1) as LayerPath)
}

function remove(row: FlatRow): void {
    props.editor.deleteLayer(row.node.path)
}

// ---- 显示/隐藏（工单 10：仅根层；经内核 action，组件零文档写语义） ----

/** 切换根层可见性：隐藏 = 渲染跳过 + 画布不可点选（内核/契约层语义），一步历史 */
function toggleVisibility(row: FlatRow): void {
    props.editor.toggleLayerVisibility(row.node.path)
}

// ---- 锁定（canvas-web-layer-lock 工单 02：仅根层；ui 变更不进历史） ----

/**
 * 切换根层锁定：整子树退出画布命中面 + 误操作防护（拖动起点/删除在内核空转），
 * 渲染产物不变（锁定 ≠ 隐藏——照常渲染输出）；不进历史（会话级 ui 态）。
 */
function toggleLock(row: FlatRow): void {
    props.editor.toggleLayerLock(row.node.path)
}

// ---- 拖放重排（根层/行/格三套落点，坐标折算与同步全在内核） ----

type DragSource =
    | { kind: 'root'; from: number }
    | { kind: 'row'; from: number; tablePath: LayerPath; rowPath: LayerPath }
    | { kind: 'cell'; from: number; cellPath: LayerPath }
const dragSource = ref<DragSource | null>(null)
const dropHint = ref<{ key: string; edge: 'before' | 'after' } | null>(null)

/**
 * 同类才可落：根层 ↔ 根层；行 ↔ 任意表的行节点（跨表内核分流；行模板节点不是
 * row 角色，天然不在落点集）；格落点按模板归属裁剪（spec §2.2 D3 + §3.2）——
 * 模板格只接受同一模板行内的格（跨容器对模板态不可达，内核原语 no-op），V1 格
 * 与模板格互不落。
 */
function canDrop(row: FlatRow): boolean {
    const source = dragSource.value
    if (!source) return false
    if (source.kind === 'root') return row.node.role === 'root'
    if (source.kind === 'row') return row.node.role === 'row'
    if (row.node.role !== 'cell') return false
    const sourceInTemplate = isTemplateSubtreePath(source.cellPath)
    if (sourceInTemplate !== row.inTemplate) return false
    if (sourceInTemplate) {
        return pathsEqual(source.cellPath.slice(0, -2), row.node.path.slice(0, -2))
    }
    return true
}

/** 把手行判定：仅根层有把手、仅根层从把手发起拖拽（行/格不加把手，I2=A 行/格不动） */
function isRootRow(row: FlatRow): boolean {
    return row.node.role === 'root'
}

function onHandleDragStart(row: FlatRow, event: DragEvent): void {
    if (!row.draggable) return
    dragSource.value =
        row.node.role === 'root'
            ? { kind: 'root', from: row.indexInGroup }
            : row.node.role === 'row'
                ? { kind: 'row', from: row.indexInGroup, tablePath: row.tablePath!, rowPath: row.node.path }
                : { kind: 'cell', from: row.indexInGroup, cellPath: row.node.path }
    // Firefox 需要 setData 才会启动拖拽；其余环境无副作用
    event.dataTransfer?.setData('text/plain', row.key)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

/** 行元素上的 dragstart：根层不发起（发起区域仅把手），行/格保持整行拖拽。
 *  把手的 dragstart 也经冒泡穿过这里——root 守卫使其空转，不会二次置源。 */
function onRowDragStart(row: FlatRow, event: DragEvent): void {
    if (isRootRow(row)) return
    onHandleDragStart(row, event)
}

/** 行元素的 draggable 属性：根层收敛到把手（整行禁拖，undefined = 摘除属性）；
 *  行/格保持整行可拖；内容行本就不可拖 */
function rowDraggableAttr(row: FlatRow): boolean | undefined {
    if (isRootRow(row)) return undefined
    return row.draggable || undefined
}

function onDragOver(row: FlatRow, event: DragEvent): void {
    if (!canDrop(row)) return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    // 落点用 clientY − 行顶：offsetY 相对 event.target（行内子元素），与 currentTarget
    // 的行盒参照系错位，指针压在 label 上时判定会漂移
    const upper = isUpperHalf(event.clientY - rect.top, rect.height)
    event.preventDefault()
    dropHint.value = { key: row.key, edge: upper ? 'before' : 'after' }
}

function onDrop(row: FlatRow, event: DragEvent): void {
    if (!canDrop(row)) return
    // 落点以 dragover 写入的 dropHint 为准（hint 与当前行不一致 = 悬空落点，拒绝）；
    // 不在 drop 里重算 offsetY——drop 事件的合成场景（jsdom）拿不到可靠坐标
    const hint = dropHint.value
    const source = dragSource.value
    if (!source || !hint || hint.key !== row.key) return
    event.preventDefault()
    // insert-before 上半落当前序号、下半 +1（内核对原位/相邻落点自动空转）
    const to = hint.edge === 'before' ? row.indexInGroup : row.indexInGroup + 1
    if (source.kind === 'root') {
        props.editor.moveRootLayer(source.from, to)
    } else if (source.kind === 'row') {
        const sameTable = row.tablePath !== null && row.tablePath.join('.') === source.tablePath.join('.')
        if (sameTable) props.editor.moveTableRow(source.tablePath, source.from, to)
        else props.editor.moveTableRowToTable(source.rowPath, row.tablePath!, to)
    } else {
        // 目标行路径 = 格节点路径去掉尾段 (cells, index)；同行重排/跨行移动内核分流
        props.editor.moveTableCellToRow(source.cellPath, row.node.path.slice(0, -2) as LayerPath, to)
    }
    dragSource.value = null
    dropHint.value = null
}

function onDragEnd(): void {
    dragSource.value = null
    dropHint.value = null
}

function isSelected(row: FlatRow): boolean {
    return pathsEqual(panel.selection.value, row.node.path)
}

function isHovered(row: FlatRow): boolean {
    return pathsEqual(panel.hovered.value, row.node.path)
}

// ---- 行内重命名（工单 09：仅根层；会话与提交漏斗都在内核 ui 分支） ----

/** 重命名输入框的草稿文本（住组件，提交才落内核——逐键不入历史） */
const renameDraft = ref('')

/**
 * 会话开启时的草稿基线（开启时点的显示标签）：提交值与基线一致 = 未改名，
 * 退化为取消语义（不落 name 键、不进历史）——未命名层草稿初值是派生标签，
 * 直接回车不得把派生标签固化为 name（spec §2.2：用户重命名才落键）。
 */
let renameBaseline: string | null = null

/** 行内输入框元素记录（函数 ref；聚焦走 renaming watch 的 nextTick，见下） */
let renameInputEl: HTMLInputElement | null = null

function setRenameInputEl(el: Element | ComponentPublicInstance | null): void {
    renameInputEl = el instanceof HTMLInputElement ? el : null
}

function isRenaming(row: FlatRow): boolean {
    return pathsEqual(panel.renaming.value, row.node.path)
}

function startRename(row: FlatRow): void {
    if (!isRootRow(row)) return
    props.editor.beginRename(row.node.path)
}

/** 提交（Enter/失焦共用）：trim 后空串 = 回退派生标签的缺省态；与基线一致 = 未改名取消 */
function commitRename(): void {
    const value = renameDraft.value.trim()
    if (renameBaseline !== null && value === renameBaseline.trim()) {
        props.editor.cancelRename()
        return
    }
    props.editor.commitRename(value)
}

function cancelRename(): void {
    props.editor.cancelRename()
}

/**
 * 会话入口统一初始化（TextEditingOverlay 同款 watch + nextTick 聚焦模式）：
 * 草稿初值 = 当前显示标签（未命名即派生标签，全选后首键即替换）——双击/铅笔/
 * F2 三入口与外部直接 beginRename 都收敛到这一处；非根层路径不会被内核接受，
 * 找不到行时草稿置空兜底。聚焦延到元素插入后（ref 回调时点尚未入文档，
 * focus 静默无效）；preventScroll 防长列表定位拽动面板。
 */
watch(panel.renaming, async (path) => {
    if (path === null) {
        renameBaseline = null
        return
    }
    const row = flatRows.value.find((candidate) => pathsEqual(candidate.node.path, path))
    renameDraft.value = row?.label ?? ''
    renameBaseline = renameDraft.value
    await nextTick()
    const el = renameInputEl
    if (el) {
        el.focus({ preventScroll: true })
        el.select()
    }
})
</script>

<template>
    <aside class="cn-props flex w-[232px] shrink-0 flex-col overflow-y-auto rounded-xl border border-cn-line bg-cn-bg text-cn-fg shadow-[0_16px_40px_-12px_rgba(2,6,23,0.55)]">
        <header class="sticky top-0 z-10 flex items-center justify-between border-b border-cn-line bg-cn-bg-elevated/95 px-3.5 py-2.5 backdrop-blur-sm">
            <span class="text-[12px] font-medium tracking-wide text-cn-fg/90">图层</span>
            <div class="flex items-center gap-1">
                <!-- 点击遮罩收菜单（透明层垫在弹层下） -->
                <div
                    v-if="addMenuOpen"
                    class="fixed inset-0 z-10"
                    data-add-backdrop
                    @pointerdown="resetAddMenu"
                ></div>
                <div class="relative z-20">
                    <button
                        type="button"
                        data-add-menu
                        :aria-expanded="addMenuOpen"
                        title="新增图层"
                        class="flex size-6 items-center justify-center rounded border border-cn-field-line bg-cn-field text-[13px] leading-none text-cn-fg/80 hover:border-cn-accent/40 hover:text-cn-accent"
                        @click="toggleAddMenu"
                    >
                        +
                    </button>
                    <div
                        v-if="addMenuOpen"
                        class="absolute left-0 top-7 flex w-40 flex-col rounded-lg border border-cn-line bg-cn-bg-elevated p-1 shadow-[0_12px_32px_rgba(2,6,23,0.55)]"
                    >
                        <template v-if="!templateFormOpen">
                            <button
                                v-for="kind in ADD_MENU"
                                :key="kind.label"
                                type="button"
                                :data-add-layer="kind.kind === 'layer' ? kind.type : 'template-table'"
                                :title="kind.title"
                                class="rounded px-2 py-1.5 text-left text-[12px] text-cn-fg/90 hover:bg-cn-accent/15 hover:text-cn-accent"
                                @click="addLayer(kind)"
                            >
                                {{ kind.label }}
                            </button>
                        </template>
                        <template v-else>
                            <p class="px-2 pt-1 text-[11px] leading-4 text-cn-muted">模板行按数据行路径展开成表</p>
                            <input
                                v-model="templateRowsPath"
                                data-template-rows-path
                                type="text"
                                placeholder="如 order.items"
                                class="mx-1 my-1 w-[calc(100%-8px)] rounded border bg-cn-field px-2 py-1 text-[12px] text-cn-fg outline-none focus:border-cn-accent/60"
                                :class="templateRowsPathInvalid ? 'border-cn-danger' : 'border-cn-field-line'"
                                @keydown.enter.prevent="addTemplateTable"
                            />
                            <p v-if="templateRowsPathInvalid" class="px-2 pb-1 text-[11px] text-cn-danger">rowsPath 必填</p>
                            <div class="flex gap-1 p-1">
                                <button
                                    type="button"
                                    data-template-confirm
                                    class="flex-1 rounded bg-cn-accent/20 px-2 py-1 text-[12px] text-cn-accent hover:bg-cn-accent/30"
                                    @click="addTemplateTable"
                                >
                                    创建
                                </button>
                                <button
                                    type="button"
                                    class="flex-1 rounded px-2 py-1 text-[12px] text-cn-muted hover:text-cn-fg"
                                    @click="resetAddMenu"
                                >
                                    取消
                                </button>
                            </div>
                        </template>
                    </div>
                </div>
            </div>
        </header>

        <p
            v-if="!hasLayers"
            class="mx-3.5 my-4 rounded-lg border border-dashed border-cn-line px-3 py-6 text-center text-[11px] leading-5 text-cn-muted"
        >
            画布还没有图层，用上方按钮新增
        </p>

        <ul class="cn-layers__tree flex flex-col gap-0.5 px-1.5 py-1" @dragend="onDragEnd">
            <li
                v-for="row in flatRows"
                :key="row.key"
                :data-key="row.key"
                :draggable="rowDraggableAttr(row)"
                class="cn-layers__row group flex cursor-default select-none items-center gap-1 py-1 pr-1 text-[12px]"
                :class="{
                    'cn-layers__row--selected': isSelected(row),
                    'cn-layers__row--hovered': isHovered(row) && !isSelected(row),
                    'cn-layers__row--hidden': isRootRow(row) && !row.node.visible,
                    'cn-layers__row--template': row.inTemplate,
                    'cursor-grab': row.draggable && !isRootRow(row),
                    'cn-layers__row--drop-before': dropHint?.key === row.key && dropHint?.edge === 'before',
                    'cn-layers__row--drop-after': dropHint?.key === row.key && dropHint?.edge === 'after',
                }"
                :style="{ paddingLeft: `${4 + row.indentLevel * 14}px` }"
                @click="select(row)"
                @mouseenter="hover(row)"
                @mouseleave="hover(null)"
                @dragstart="onRowDragStart(row, $event)"
                @dragover="onDragOver(row, $event)"
                @drop="onDrop(row, $event)"
            >
                <span
                    v-if="isRootRow(row)"
                    data-drag-handle
                    draggable="true"
                    title="拖动排序"
                    class="cn-layers__handle shrink-0"
                    @dragstart="onHandleDragStart(row, $event)"
                >
                    <PanelIcon :icon="GripVertical" :size="12" :stroke-width="2.5" />
                </span>
                <!-- 表达式前置（工单 02）：只读内核投影字段（零计算），拖柄与标签
                     之间行内显示；空串不渲染任何元素，样式走 panel-theme 令牌 -->
                <span
                    v-if="row.node.expressionPrefix !== ''"
                    class="cn-layers__prefix"
                    :title="row.node.expressionPrefix"
                >{{ row.node.expressionPrefix }}</span>
                <input
                    v-if="isRenaming(row)"
                    :ref="setRenameInputEl"
                    v-model="renameDraft"
                    data-rename-input
                    aria-label="图层重命名"
                    class="cn-layers__rename-input min-w-0 flex-1"
                    @click.stop
                    @dblclick.stop
                    @keydown.enter.prevent="commitRename()"
                    @keydown.esc.prevent="cancelRename()"
                    @blur="commitRename()"
                />
                <span
                    v-else
                    class="cn-layers__label min-w-0 flex-1 truncate font-mono text-[11px] leading-4"
                    @dblclick="startRename(row)"
                >
                    {{ row.label }}
                </span>
                <button
                    v-if="isRootRow(row)"
                    type="button"
                    data-visibility
                    class="cn-layers__eye size-5 shrink-0 items-center justify-center rounded text-cn-muted hover:bg-cn-accent/15 hover:text-cn-accent"
                    :class="row.node.visible ? 'hidden group-hover:flex' : 'flex'"
                    :title="row.node.visible ? '隐藏图层（最终输出不含该层）' : '显示图层'"
                    :aria-pressed="!row.node.visible"
                    @click.stop="toggleVisibility(row)"
                >
                    <PanelIcon :icon="row.node.visible ? Eye : EyeOff" :size="11" :stroke-width="2" />
                </button>
                <!-- 锁定钮（canvas-web-layer-lock 工单 02）：眼睛同款 hover 门控，锁定态
                     常显闭锁（aria-pressed = locked）；锁定行不加透明度类——锁定 ≠ 隐藏
                     （hidden 降不透明度表达「不出现」，locked 表达「出现但受保护」） -->
                <button
                    v-if="isRootRow(row)"
                    type="button"
                    data-lock
                    class="cn-layers__lock size-5 shrink-0 items-center justify-center rounded text-cn-muted hover:bg-cn-accent/15 hover:text-cn-accent"
                    :class="row.node.locked ? 'flex' : 'hidden group-hover:flex'"
                    :title="row.node.locked ? '解锁图层（⇧⌘L）' : '锁定图层（画布不可点选/拖动/删除，渲染照常）'"
                    :aria-pressed="row.node.locked"
                    @click.stop="toggleLock(row)"
                >
                    <PanelIcon :icon="row.node.locked ? Lock : LockOpen" :size="11" :stroke-width="2" />
                </button>
                <button
                    v-if="isRootRow(row)"
                    type="button"
                    data-rename
                    class="cn-layers__delete hidden size-5 shrink-0 items-center justify-center rounded text-cn-muted hover:bg-cn-accent/15 hover:text-cn-accent group-hover:flex"
                    title="重命名（双击名称或 F2）"
                    @click.stop="startRename(row)"
                >
                    <PanelIcon :icon="Pencil" :size="11" :stroke-width="2" />
                </button>
                <button
                    v-if="row.node.role === 'root' && row.node.type === 'TableLayer'"
                    type="button"
                    data-add-row
                    class="cn-layers__delete hidden size-5 shrink-0 items-center justify-center rounded text-[10px] leading-none text-cn-muted hover:bg-cn-accent/15 hover:text-cn-accent group-hover:flex disabled:cursor-not-allowed disabled:text-cn-muted/50 disabled:hover:bg-transparent"
                    :disabled="row.node.templated === true"
                    :title="row.node.templated === true ? '模板态不可加行——行由数据展开' : '加行（缺省行 + 缺省格与文本，行宽=表宽）'"
                    @click.stop="addRow(row)"
                >
                    +行
                </button>
                <button
                    v-if="row.node.role === 'row'"
                    type="button"
                    data-add-cell
                    class="cn-layers__delete hidden size-5 shrink-0 items-center justify-center rounded text-[10px] leading-none text-cn-muted hover:bg-cn-accent/15 hover:text-cn-accent group-hover:flex"
                    title="加格（缺省格 + 文本内容，行高取最高格）"
                    @click.stop="addCell(row)"
                >
                    +格
                </button>
                <button
                    v-if="row.node.role === 'templateRow'"
                    type="button"
                    data-add-template-cell
                    class="cn-layers__delete hidden size-5 shrink-0 items-center justify-center rounded text-[10px] leading-none text-cn-muted hover:bg-cn-accent/15 hover:text-cn-accent group-hover:flex"
                    title="加格（缺省格 + 文本内容，零高度耦合——行高由数据展开定稿）"
                    @click.stop="addTemplateCell(row)"
                >
                    +格
                </button>
                <!-- 删除钮：模板替身与锁定子树（root 携 locked 即整棵子树）置灰——
                     内核 deleteLayer 空转为权威，UI 呈现一致（工单 02） -->
                <button
                    type="button"
                    class="cn-layers__delete hidden size-5 shrink-0 items-center justify-center rounded text-[10px] leading-none text-cn-muted hover:bg-cn-danger/15 hover:text-cn-danger group-hover:flex disabled:cursor-not-allowed disabled:text-cn-muted/50 disabled:hover:bg-transparent disabled:hover:text-cn-muted/50"
                    :disabled="row.node.role === 'templateRow' || row.node.locked"
                    :title="row.node.role === 'templateRow'
                        ? '行模板由表持有——转换回普通表请用 V2 转换入口'
                        : row.node.locked
                            ? '图层已锁定（⇧⌘L 解锁后可删除）'
                            : '删除（含子层）'"
                    @click.stop="remove(row)"
                >
                    ✕
                </button>
            </li>
        </ul>
    </aside>
</template>
