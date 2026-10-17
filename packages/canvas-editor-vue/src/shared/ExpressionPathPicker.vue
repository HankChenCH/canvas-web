<script setup lang="ts">
/**
 * ExpressionPathPicker：资源表达式级联路径选择器（resource-expression-single-ref
 * 工单 05，ADR 0020）——资源内容字段的作者面 = 纯菜单点选（spec：不设手输缝，
 * 菜单点选是唯一写入口）。
 *
 * - 契约：v-model 直接绑**裸点路径**（`{{}}` 拆装归字段控件壳，见
 *   resourceTemplate.ts）；`source` 即面板同款 CompletionSource（逐层
 *   `source(已积累路径)` 取候选，`.` 尾点下钻同款调用）；候选按 kind === 'path'
 *   过滤（pathPickerModel——函数桶不进选择器面）。
 * - 终点形态分叉（rows-path-picker 工单 02，spec D3/D6）：mode 缺省 'resource'
 *   = 叶子终点（资源面现状零改动——探层推断下钻/提交）；'rowsPath' = 数组终点
 *   （仅数组可激活提交、对象只可下钻，判定矩阵归 pathPickerModel；数组徽标
 *   「行数组」；空层提示「声明中未发现行数组，请检查数据源绑定」）。级联壳/
 *   键盘导航/浮层定位两 mode 全共享；激活提交契约不变（update:modelValue +
 *   change 同发，value = 所选 path，包壳/写管线归接线工单）。
 * - 呈现：只读展示框（modelValue 原文回显，存量违例原样透传展示——拆装壳把
 *   拆不动的原文直接传入）+ 级联菜单钮。菜单为单面板逐层下钻（层级栈 + 返回
 *   行），object 节点点选下钻（可下钻判定 = 尾点取层非空，pathPickerModel），
 *   叶子点选提交（update:modelValue + change 同发，壳层包壳走既有 commit 管线）。
 * - 面包屑前缀（rows-path-picker 工单 06，两 mode 同享）：非根层行在段名前弱化
 *   显示已积累路径，根层行不渲染前缀维持纯段名——前缀派生/分隔符常量/截断面
 *   语义的权威描述见 pathPickerModel 模块头，模板只做拆分呈现。
 * - `source === null`（未绑 schema，引用以声明为门）：不渲染菜单入口，组件
 *   整体只读回显；disabled 同款（会话内容锁定面）。
 * - 浮层 Teleport 到 body + fixed 定位（躲面板 overflow 裁剪），锚点 = 组件根
 *   盒（按钮所在框），落点经 placePopupInViewport——下方放不下向上翻转、翻转
 *   仍不足钳制视口内（工单 06 伴生修复的同款定位实现）；scroll/resize 随动，
 *   首帧量不到尺寸延一拍补量（既有浮层同语）。
 * - 收起：Esc（回焦触发钮）/点外（window pointerdown，容器包含判定吃掉「点
 *   触发钮收了又被 click 重开」时序——useDropdownMenu 同门）/Tab（原生序续走）/
 *   提交。开态才挂监听（先例 StatusBar.vue）。浮层根 @pointerdown.stop：菜单经
 *   Teleport 挂 body 后在宿主容器（下拉底座菜单体、面板 aside）之外——点选不
 *   得触发宿主的 window 点外收连坐收起（ExpressionCompletionPopup 同缝先例，
 *   rows-path-picker 工单 04 建表表单入下拉 body 消费面所必需）；自身点外收
 *   判定含浮层本体（onWindowPointerDown 容器面），不受影响。
 * - 根元素自带 .cn-props 命名空间承载（浮层同 ExpressionCompletionPopup：portal
 *   后脱离面板 DOM 子树，靠根类名重建 --cn-* 令牌解析）；视觉沿 panel-theme
 *   令牌，几何以 tailwind utility 留在模板。
 */
import { computed, nextTick, onScopeDispose, ref, watch } from 'vue'

import type { CompletionSource } from './completion'
import {
    PATH_PICKER_BREADCRUMB_SEPARATOR,
    pathPickerEntries,
    pathPickerParentPrefix,
    type PathPickerEntry,
    type PathPickerMode,
} from './pathPickerModel'
import { placePopupInViewport } from './popupPosition'
import { ROWS_PATH_ARRAY_BADGE } from './rowsPathPickerSource'

const props = defineProps<{
    /** 裸点路径原文（壳已拆 `{{}}`；存量违例拆不动时壳原样透传，只读回显） */
    modelValue: string
    /** 候选源（面板同款注入缝）；null = 未绑声明，不渲染菜单入口整体只读 */
    source: CompletionSource | null
    /** 禁用（会话内容锁定面）：同 null 的只读呈现 */
    disabled?: boolean
    /** 展示框/菜单的可访问名（字段标签透传） */
    ariaLabel?: string
    /** 空值占位文案 */
    placeholder?: string
    /**
     * 终点形态（rows-path-picker 工单 02，spec D3）：'resource' = 叶子终点
     * （缺省，资源面既有调用零改动）；'rowsPath' = 数组终点（仅数组可选、
     * 对象只下钻、空态提示行）。判定矩阵归 pathPickerModel，壳全共享。
     */
    mode?: PathPickerMode
}>()

const emit = defineEmits<{ 'update:modelValue': [path: string]; change: [path: string] }>()

/** 菜单入口在场面：未绑声明/禁用都不渲染（引用以声明为门，spec §4） */
const hasMenu = computed(() => !props.disabled && props.source !== null)

/* ---- 菜单开合与层级栈 ---- */

interface PickerLevel {
    /** 取层入参（'' = 头部层；下钻层 = 父路径 + 补全尾点） */
    prefix: string
    /** 返回行展示的父路径（'' = 根级） */
    label: string
    entries: readonly PathPickerEntry[]
}

const open = ref(false)
const levels = ref<PickerLevel[]>([])
const activeIndex = ref(0)

const currentLevel = computed<PickerLevel | null>(() => levels.value[levels.value.length - 1] ?? null)

/** 返回行文案：根级回退通用措辞（层级栈深度 > 0 才渲染返回行） */
const backLabel = computed(() => {
    const parent = levels.value[levels.value.length - 2]
    return parent === undefined ? '' : parent.label === '' ? '根级字段' : parent.label
})

/** 空层提示文案（spec D6）：rowsPath 面 = 无可达行数组的显式引导；resource 面 = 既有弱提示 */
const emptyText = computed(() =>
    props.mode === 'rowsPath' ? '声明中未发现行数组，请检查数据源绑定' : '无可选字段',
)

/** 徽标文案：rowsPath 面数组终点标「行数组」（spec D3，展示词汇单点共享）；其余 type 原文透传 */
function badgeText(type: string): string {
    return props.mode === 'rowsPath' && type === 'array' ? ROWS_PATH_ARRAY_BADGE : type
}

/** 当前层菜单行（工单 06 呈现拆分）：条目 + 面包屑前缀（path 去尾段，根层行 '' 不渲染前缀） */
const currentRows = computed(() =>
    (currentLevel.value?.entries ?? []).map((entry) => ({
        entry,
        prefix: pathPickerParentPrefix(entry.path),
    })),
)

function buildLevel(prefix: string, label: string): PickerLevel {
    return {
        prefix,
        label,
        entries: props.source === null ? [] : pathPickerEntries(props.source, prefix, props.mode),
    }
}

function openMenu(): void {
    if (!hasMenu.value || open.value) return
    levels.value = [buildLevel('', '')]
    activeIndex.value = 0
    open.value = true
    void nextTick(() => {
        reposition()
        menuRoot.value?.focus()
    })
}

function closeMenu(): void {
    if (!open.value) return
    dismiss()
    toggleButton.value?.focus()
}

/** 收起（不回焦）：点外路径焦点归用户点击落点（下拉底座同门） */
function dismiss(): void {
    open.value = false
    levels.value = []
    activeIndex.value = 0
}

function toggleMenu(): void {
    if (open.value) closeMenu()
    else openMenu()
}

/** 下钻：压层级栈（label = 进入路径尾段）；空层也压（空态行提示无下级） */
function drillDown(entry: PathPickerEntry): void {
    if (props.source === null) return
    levels.value.push(buildLevel(`${entry.path}.`, entry.path))
    activeIndex.value = 0
    void nextTick(reposition)
}

function levelUp(): void {
    if (levels.value.length <= 1) return
    levels.value.pop()
    activeIndex.value = 0
    void nextTick(reposition)
}

/** 点选分派：可下钻 = 进入下一层；可激活终点 = 提交（update:modelValue + change 同发）。两 mode 判定矩阵归 pathPickerModel */
function activate(entry: PathPickerEntry): void {
    if (entry.drillable) {
        drillDown(entry)
        return
    }
    if (!entry.activatable) return // rowsPath 死端防御（剪枝语义下对象恒可下钻，不出现）
    emit('update:modelValue', entry.path)
    emit('change', entry.path)
    closeMenu()
}

function activeEntry(): PathPickerEntry | null {
    return currentLevel.value?.entries[activeIndex.value] ?? null
}

/* ---- 键盘导航（菜单根 tabindex=-1 承焦点，开时入菜单） ---- */

function onMenuKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault()
        closeMenu()
        return
    }
    if (event.key === 'Tab') {
        closeMenu() // 不拦：原生 Tab 序自触发钮续走（触发钮非终态，APG 同例）
        return
    }
    const entries = currentLevel.value?.entries ?? []
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const count = entries.length
        if (count > 0) {
            activeIndex.value = (activeIndex.value + (event.key === 'ArrowDown' ? 1 : count - 1)) % count
        }
        return
    }
    if (event.key === 'ArrowRight') {
        const entry = activeEntry()
        if (entry?.drillable) {
            event.preventDefault()
            drillDown(entry)
        }
        return
    }
    if (event.key === 'ArrowLeft') {
        if (levels.value.length > 1) {
            event.preventDefault()
            levelUp()
        }
        return
    }
    if (event.key === 'Enter' || event.key === ' ') {
        const entry = activeEntry()
        if (entry !== null) {
            event.preventDefault() // 显式激活防原生 click 双跑（下拉底座同门）
            activate(entry)
        }
    }
}

/* ---- 浮层定位（placePopupInViewport 单点：翻转 + 钳制） ---- */

const rootRef = ref<HTMLElement | null>(null)
const toggleButton = ref<HTMLButtonElement | null>(null)
const menuRoot = ref<HTMLElement | null>(null)
const top = ref(0)
const left = ref(0)

function reposition(): void {
    if (!open.value) return
    const anchorEl = rootRef.value
    const menuEl = menuRoot.value
    if (anchorEl === null) return
    const rect = anchorEl.getBoundingClientRect()
    // DOMRect 结构兼容 PopupAnchorBox（top/bottom/left 三轴）
    const placed = placePopupInViewport({
        anchor: rect,
        popupWidth: menuEl?.offsetWidth ?? 0,
        popupHeight: menuEl?.offsetHeight ?? 0,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
    })
    top.value = placed.top
    left.value = placed.left
}

function onViewportChange(): void {
    reposition()
}

watch(open, (isOpen) => {
    if (isOpen) {
        window.addEventListener('pointerdown', onWindowPointerDown)
        window.addEventListener('keydown', onWindowKeydown)
        window.addEventListener('scroll', onViewportChange, true)
        window.addEventListener('resize', onViewportChange)
    } else {
        detachListeners()
    }
})

/** 点外收（不回焦）：容器 = 组件根 + 浮层本体（Teleport 到 body 后两者都在判定面内） */
function onWindowPointerDown(event: PointerEvent): void {
    const target = event.target
    if (!(target instanceof Node)) return
    if (rootRef.value?.contains(target) || menuRoot.value?.contains(target)) return
    dismiss()
}

function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') closeMenu()
}

function detachListeners(): void {
    window.removeEventListener('pointerdown', onWindowPointerDown)
    window.removeEventListener('keydown', onWindowKeydown)
    window.removeEventListener('scroll', onViewportChange, true)
    window.removeEventListener('resize', onViewportChange)
}

onScopeDispose(detachListeners, true)
</script>

<template>
    <!-- 单根（Teleport 内嵌）：控件经 `<component :is>` 分发时 fallthrough 类
         （cn-field--expression/invalid 红边与表达式视觉）落本根盒——fragment 根
         不继承类还会告警；Teleport 内容仍归宿主 body，不受嵌套影响 -->
    <div ref="rootRef" class="cn-pathpicker flex w-full items-center gap-1.5">
        <!-- 只读展示框：modelValue 原文回显（存量违例原样透传展示），零手输缝 -->
        <div
            class="cn-pathpicker__value min-w-0 flex-1 truncate rounded-md border border-cn-field-line bg-cn-field px-2 py-1.5 font-mono text-[11px] leading-none text-cn-fg"
            :class="modelValue === '' ? 'text-cn-muted' : ''"
            :title="modelValue"
            :aria-label="ariaLabel"
        >{{ modelValue === '' ? (placeholder ?? '点击右侧按钮选择字段') : modelValue }}</div>
        <button
            v-if="hasMenu"
            ref="toggleButton"
            type="button"
            class="cn-pathpicker__toggle h-7 shrink-0 rounded-md border border-cn-field-line bg-cn-field px-1.5 text-[11px] leading-none text-cn-muted transition-colors duration-100 hover:border-cn-muted/40 hover:text-cn-fg"
            aria-haspopup="menu"
            :aria-expanded="open"
            :aria-label="ariaLabel === undefined ? '选择字段路径' : `选择字段路径（${ariaLabel}）`"
            title="选择字段路径"
            @click="toggleMenu"
        >▾</button>
        <!-- 级联菜单浮层：portal 到 body，单面板逐层下钻（层级栈 + 返回行） -->
        <Teleport to="body">
            <div
                v-if="open && currentLevel !== null"
                ref="menuRoot"
                class="cn-props cn-pathpicker__menu fixed z-50 max-h-[240px] min-w-[180px] max-w-[280px] overflow-y-auto rounded-md border border-cn-field-line py-1 text-[11px] leading-none"
                :style="{ top: `${top}px`, left: `${left}px` }"
                role="menu"
                :aria-label="ariaLabel === undefined ? '字段路径菜单' : `${ariaLabel} 字段路径菜单`"
                tabindex="-1"
                @keydown.stop="onMenuKeydown"
                @pointerdown.stop
            >
                <!-- 返回行（层级栈深度 > 0）：‹ 目的地（父路径/根级） -->
                <button
                    v-if="levels.length > 1"
                    type="button"
                    role="menuitem"
                    class="cn-pathpicker__back flex w-full items-center gap-1 border-b border-cn-line/70 px-2 py-1.5 text-left text-cn-muted"
                    @click="levelUp"
                >
                    <span aria-hidden="true">‹</span>
                    <span class="truncate font-mono">{{ backLabel }}</span>
                </button>
                <!-- 空层提示（声明为空/无可达行数组/行 schema 未解析）：非交互弱提示行 -->
                <div
                    v-if="currentLevel.entries.length === 0"
                    class="cn-pathpicker__empty px-2 py-2 text-cn-muted"
                >{{ emptyText }}</div>
                <button
                    v-for="(row, index) in currentRows"
                    :key="`${row.entry.path}`"
                    type="button"
                    role="menuitem"
                    class="cn-pathpicker__option flex w-full items-center gap-1.5 px-2 py-1.5 text-left"
                    :class="index === activeIndex ? 'cn-pathpicker__option--active' : ''"
                    :aria-label="row.entry.path"
                    :title="row.entry.path"
                    @click="activate(row.entry)"
                    @mousemove="activeIndex = index"
                >
                    <!-- 面包屑前缀（工单 06）：非根层行弱化父路径，点选途中全路径可见；
                         min-w-0 truncate 可截，段名 shrink-0 尾段恒可见（max-w 截断面不回退） -->
                    <span
                        v-if="row.prefix !== ''"
                        class="cn-pathpicker__prefix min-w-0 truncate font-mono text-cn-muted"
                    >{{ row.prefix }} {{ PATH_PICKER_BREADCRUMB_SEPARATOR }}</span>
                    <span
                        class="cn-pathpicker__segment truncate font-mono text-cn-fg"
                        :class="row.prefix === '' ? 'min-w-0' : 'shrink-0 max-w-full'"
                    >{{ row.entry.item.segment }}</span>
                    <span
                        v-if="row.entry.item.type"
                        class="shrink-0 rounded-sm bg-cn-field px-1 py-0.5 text-[9px] leading-none text-cn-muted"
                    >{{ badgeText(row.entry.item.type) }}</span>
                    <span
                        v-if="row.entry.item.description ?? row.entry.item.title"
                        class="min-w-0 flex-1 truncate text-[10px] leading-none text-cn-muted"
                    >{{ row.entry.item.description ?? row.entry.item.title }}</span>
                    <!-- 可下钻指示（object/结构节点）：点选进入下一层 -->
                    <span
                        v-if="row.entry.drillable"
                        class="cn-pathpicker__drill ml-auto shrink-0 text-cn-muted"
                        aria-hidden="true"
                    >›</span>
                </button>
            </div>
        </Teleport>
    </div>
</template>
