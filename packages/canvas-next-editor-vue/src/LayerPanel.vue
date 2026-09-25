<script setup lang="ts">
/**
 * <LayerPanel>：图层面板（工单 10/12）——树形大纲（根层 = 视觉逆序，表格三层
 * 嵌套展开）、拖动重排（根层走 priority 中点插值 / 行格直接改数组序，两套语义
 * 分立；行可跨表、格可跨行——跨容器落点走内核重建路径同步尺寸）、增删（新增
 * 置顶 min−1、加行/加格走重建路径、删除含子树）、点选/悬停与画布双向联动。
 * 视觉沿用 .cn-props 主题命名空间（与属性面板同一套设计令牌）。
 *
 * 拖放约定：行上半 = insert-before 当前行、下半 = insert-after（面板底经最后
 * 一行的下半可达）；行落点 = 任意行的行节点（同表重排/跨表移动内核自动分流），
 * 格落点 = 任意格节点（同行重排/跨行移动同款）。内核对原位/相邻落点自动空转
 * （无历史步）。
 */
import { computed, ref } from 'vue'

import {
    pathsEqual,
    type EditorSession,
    type LayerOutlineNode,
    type LayerPath,
    type LayerType,
} from '@hankchen/canvas-next-editor'

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
    draggable: boolean
}

const ADD_TYPES: readonly { type: LayerType; label: string; title: string }[] = [
    { type: 'TextLayer', label: '文', title: '新增文本层' },
    { type: 'ImageLayer', label: '图', title: '新增图片层' },
    { type: 'QrCodeLayer', label: '码', title: '新增二维码层' },
    { type: 'TableLayer', label: '表', title: '新增表格层' },
]

/** 显示名：根层 = type + 同类序号（graph 无 name 字段）；行/格 = 容器内序号；内容 = type */
function labelFor(node: LayerOutlineNode, typeOrdinal: number): string {
    switch (node.role) {
        case 'root':
            return `${node.type} ${typeOrdinal}`
        case 'row':
            return `行 ${Number(node.path[node.path.length - 1]) + 1}`
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
        // 行节点的宿主表 = 去掉尾段 (key, index) 的路径；格/内容继承传入的表路径
        const rowTablePath = node.role === 'row' ? (node.path.slice(0, -2) as LayerPath) : tablePath
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

// ---- 增删（内核 action：根层新增置顶 min−1；行/格新增走重建路径；删除含子树） ----

function add(type: LayerType): void {
    props.editor.addRootLayer(type)
}

/** 表节点的「加行」：缺省行 + 缺省格（带文本内容），行宽=表宽 */
function addRow(row: FlatRow): void {
    props.editor.addTableRow(row.node.path)
}

/** 行节点的「加格」：缺省格 + 文本内容，行高取最高格 */
function addCell(row: FlatRow): void {
    props.editor.addTableCell(row.node.path)
}

function remove(row: FlatRow): void {
    props.editor.deleteLayer(row.node.path)
}

// ---- 拖放重排（根层/行/格三套落点，坐标折算与同步全在内核） ----

type DragSource =
    | { kind: 'root'; from: number }
    | { kind: 'row'; from: number; tablePath: LayerPath; rowPath: LayerPath }
    | { kind: 'cell'; from: number; cellPath: LayerPath }
const dragSource = ref<DragSource | null>(null)
const dropHint = ref<{ key: string; edge: 'before' | 'after' } | null>(null)

/** 同类才可落：根层 ↔ 根层；行 ↔ 任意表的行节点（跨表内核分流）；格 ↔ 任意行的格节点 */
function canDrop(row: FlatRow): boolean {
    const source = dragSource.value
    if (!source) return false
    if (source.kind === 'root') return row.node.role === 'root'
    if (source.kind === 'row') return row.node.role === 'row'
    return row.node.role === 'cell'
}

function onDragStart(row: FlatRow, event: DragEvent): void {
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
</script>

<template>
    <aside class="cn-props flex w-[232px] shrink-0 flex-col overflow-y-auto rounded-xl border border-cn-line bg-cn-bg text-cn-fg shadow-[0_16px_40px_-12px_rgba(2,6,23,0.55)]">
        <header class="sticky top-0 z-10 flex items-center justify-between border-b border-cn-line bg-cn-bg-elevated/95 px-3.5 py-2.5 backdrop-blur-sm">
            <span class="text-[12px] font-medium tracking-wide text-cn-fg/90">图层</span>
            <div class="flex items-center gap-1">
                <button
                    v-for="item in ADD_TYPES"
                    :key="item.type"
                    type="button"
                    :data-add="item.type"
                    :title="item.title"
                    class="size-6 rounded border border-cn-field-line bg-cn-field text-[11px] leading-none text-cn-fg/80 hover:border-cn-accent/40 hover:text-cn-accent"
                    @click="add(item.type)"
                >
                    {{ item.label }}
                </button>
            </div>
        </header>

        <p
            v-if="!hasLayers"
            class="mx-3.5 my-4 rounded-lg border border-dashed border-cn-line px-3 py-6 text-center text-[11px] leading-5 text-cn-muted"
        >
            画布还没有图层，用上方按钮新增
        </p>

        <ul class="cn-layers__tree flex flex-col py-1" @dragend="onDragEnd">
            <li
                v-for="row in flatRows"
                :key="row.key"
                :data-key="row.key"
                :draggable="row.draggable"
                class="cn-layers__row group flex cursor-default select-none items-center gap-1 border-l-2 py-1 pr-1.5 text-[12px]"
                :class="{
                    'cn-layers__row--selected': isSelected(row),
                    'cn-layers__row--hovered': isHovered(row) && !isSelected(row),
                    'cursor-grab': row.draggable,
                    'border-transparent hover:bg-cn-field': !isSelected(row) && !isHovered(row),
                    'border-transparent bg-cn-field': isHovered(row) && !isSelected(row),
                    'border-cn-accent bg-cn-accent-soft text-cn-accent': isSelected(row),
                    'border-t-cn-accent/70': dropHint?.key === row.key && dropHint?.edge === 'before',
                    'border-b-cn-accent/70': dropHint?.key === row.key && dropHint?.edge === 'after',
                }"
                :style="{ paddingLeft: `${8 + row.indentLevel * 14}px` }"
                @click="select(row)"
                @mouseenter="hover(row)"
                @mouseleave="hover(null)"
                @dragstart="onDragStart(row, $event)"
                @dragover="onDragOver(row, $event)"
                @drop="onDrop(row, $event)"
            >
                <span class="cn-layers__label min-w-0 flex-1 truncate font-mono text-[11px] leading-4">
                    {{ row.label }}
                </span>
                <button
                    v-if="row.node.role === 'root' && row.node.type === 'TableLayer'"
                    type="button"
                    data-add-row
                    class="cn-layers__delete hidden size-5 shrink-0 items-center justify-center rounded text-[10px] leading-none text-cn-muted hover:bg-cn-accent/15 hover:text-cn-accent group-hover:flex"
                    title="加行（缺省行 + 缺省格与文本，行宽=表宽）"
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
                    type="button"
                    class="cn-layers__delete hidden size-5 shrink-0 items-center justify-center rounded text-[10px] leading-none text-cn-muted hover:bg-cn-danger/15 hover:text-cn-danger group-hover:flex"
                    title="删除（含子层）"
                    @click.stop="remove(row)"
                >
                    ✕
                </button>
            </li>
        </ul>
    </aside>
</template>
