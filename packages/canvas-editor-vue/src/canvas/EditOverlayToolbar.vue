<script setup lang="ts">
/**
 * EditOverlayToolbar：编辑浮层工具条（canvas-web-edit-overlay-toolbar 工单 03/04，
 * ADR 0019）——ContentTypePill 原地演进：内容类型切换浮层降为工具条首段（CONTEXT
 * 词条「内容类型切换浮层」），工单 04 续接字体/字号/字色/水平对齐/垂直对齐/自动
 * 换行五组样式段成七段单行（左→右定稿布局，对齐为两段三键非九宫格）。
 *
 * - 编辑会话期由 TextEditingOverlay 内挂在图层框上缘中点（翻转/钳制换算在
 *   useTextEditing.toolbarStyle）；选中态不显示（工具条仅编辑会话期存在）。
 *   屏幕恒定尺寸：屏幕坐标定位、无 scale 变换（与 textarea/旧 pill 的场景像素
 *   换算系分叉，浮层定位两套并存），任何缩放级别下可读可点；字号段读数恒为
 *   场景像素值（文档值，不随 zoom 折算）。
 * - 内容类型段（静态｜表达式）：激活项高亮随 ui.editing.expression（会话活标志
 *   ，ADR 0019）；切换语义上抛 change 归绑定层 setExpressionMode（仅翻会话标志，
 *   零文档变更零历史步），本组件零状态（ValueTypeSegmented 同门）。
 * - 五组样式段（工单 04）：显示值全部来自 props（TextEditingOverlay 投影内核
 *   textEditLayout——面板/工具条双入口同源，state 无分叉）；写入上抛 style 归
 *   绑定层 updateStyleField（面板同门权威写：updateSpec + `sel:path:key`
 *   mergeKey，新层样式槽随权威写自动捕获）。合并语义与面板一致——select/change
 *   类一次点击 = final 收口一步；拾色拖动 input live 合并、change 收口；字号
 *   步进连续点按合并（nudge 同门开放键）。本组件零状态（字号输入草稿除外）。
 * - 焦点语义：根拦 pointerdown 默认行为——按钮类点按不夺 textarea 焦点（免 blur
 *   延迟提交路径）；字体下拉/字号输入/拾色器三输入件 @pointerdown.stop 放行
 *   默认行为（可聚焦/可开弹层），其夺焦引发的 blur 由 useTextEditing 豁免（
 *   点面板同门）。不 stop 冒泡（输入件除外）——豁免判定（ownsEventTarget 覆盖
 *   整条工具条）仍由表面组件 pointerdown 处理器亲见。
 * - 视觉令牌自带主题（ContextMenu 同门，不依赖宿主接线）。
 */
import type { LucideIcon } from '@lucide/vue'
import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignStartHorizontal,
    AlignStartVertical,
    Minus,
    Plus,
    TextWrap,
} from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import {
    HORIZONTAL_ALIGNS,
    VERTICAL_ALIGNS,
    type HorizontalAlign,
    type VerticalAlign,
} from '@hankchen/canvas-editor'

import { injectFontPicker } from '../shared/fontPicker'
import PanelIcon from '../shared/PanelIcon.vue'

const props = defineProps<{
    /** 当前会话模式（ui.editing.expression 投影）：激活项高亮随之 */
    mode: 'static' | 'expression'
    /** 字体引用（textEditLayout.font 原串；空串 = 内置默认字体） */
    font: string
    /** 场景字号（读数恒场景像素，不随 zoom 折算——工单 04 验收项） */
    fontSize: number
    fontColor: string
    horizontalAlign: HorizontalAlign
    verticalAlign: VerticalAlign
    autowrap: boolean
}>()

/**
 * 样式段写上抛（权威写归绑定层）：key = 图层内字段路径（updateSpec 键面，
 * fieldSchema 同一约定）；final = 收口（change/blur，false = live 合并）。
 * 事件名 styleWrite（非 style）：与宿主绑定的定位属性 :style 是两回事，
 * 同名会在模板标签上混淆两个不相关的概念。
 */
const emit = defineEmits<{
    change: [value: 'static' | 'expression']
    styleWrite: [write: { key: readonly string[]; value: unknown; final: boolean }]
}>()

const rootRef = ref<HTMLElement | null>(null)

// 根元素外 exposure：宿主（TextEditingOverlay）转交 useTextEditing 入豁免集与实测尺寸
defineExpose({ rootEl: rootRef })

function write(key: readonly string[], value: unknown, final: boolean): void {
    emit('styleWrite', { key, value, final })
}

/** 两项静态定义（内容类型段，原 pill 的段定义原地收编为首段） */
const SEGMENTS: readonly { value: 'static' | 'expression'; label: string }[] = [
    { value: 'static', label: '静态' },
    { value: 'expression', label: '表达式' },
]

function pick(value: 'static' | 'expression'): void {
    if (value === props.mode) return
    emit('change', value)
}

// ---- 字体下拉段（清单经 shared fontPicker 注入缝；未注入退化两态可选） ----

const picker = injectFontPicker()

/** 下拉选项：内置默认（空引用）+ 清单条目 + 清单外的当前引用原样保留（FontField 同门） */
const fontOptions = computed(() => {
    const list: Array<{ label: string; value: string }> = [{ label: '内置默认字体', value: '' }]
    if (picker !== null) {
        for (const entry of picker.entries.value) {
            if (entry.ref !== '') list.push({ label: entry.label, value: entry.ref })
        }
    }
    const current = props.font
    if (current !== '' && !list.some((option) => option.value === current)) {
        list.push({ label: describeRef(current), value: current })
    }
    return list
})

/** 引用的展示名：内联数据走语义描述，URL/路径取尾段（避免长串撑爆工具条） */
function describeRef(fontRef: string): string {
    if (fontRef.startsWith('data:')) return '自定义字体（内联）'
    const tail = fontRef.split('/').pop()
    return tail ? tail : fontRef
}

function onFontChange(event: Event): void {
    // 一次选择 = 收口一步（AlignField 同门）
    write(['font'], (event.target as HTMLSelectElement).value, true)
}

// ---- 字号步进段（− / 场景 px 读数 / +）：草稿语义 NumberField 同门 ----

const SIZE_MIN = 1

const sizeDraft = ref(String(props.fontSize))
const sizeFocused = ref(false)

// 聚焦中的草稿是用户输入现场，外部变更（实时提交回声除外——值已一致）不打扰
watch(
    () => props.fontSize,
    (value) => {
        if (!sizeFocused.value) sizeDraft.value = String(value)
    },
)

function clampSize(value: number): number {
    return Math.max(SIZE_MIN, Math.trunc(value))
}

/** 空串/非数字串视为未成形输入（Number('') === 0 会把清空误提交为 0） */
function parseSize(input: HTMLInputElement): number | null {
    if (input.value.trim() === '') return null
    const parsed = Number(input.value)
    return Number.isFinite(parsed) ? parsed : null
}

function onSizeInput(event: Event): void {
    const input = event.target as HTMLInputElement
    sizeDraft.value = input.value
    const parsed = parseSize(input)
    if (parsed === null) return
    write(['fontSize'], clampSize(parsed), false) // live 合并（面板数字输入同门）
}

/** change/blur 收口（双发幂等）：草稿自愈为钳位后的提交值；非法值回显文档值 */
function onSizeFinish(event: Event): void {
    const input = event.target as HTMLInputElement
    const parsed = parseSize(input)
    if (parsed === null) {
        sizeDraft.value = String(props.fontSize)
        return
    }
    const value = clampSize(parsed)
    sizeDraft.value = String(value)
    write(['fontSize'], value, true)
}

function stepSize(delta: number): void {
    const value = clampSize(props.fontSize + delta)
    // 聚焦中也同步草稿：步进是显式定值动作，覆盖输入现场（否则 blur 收口会把
    // 输入框里的旧值重新写回，吞掉步进）
    sizeDraft.value = String(value)
    // 连续点按合并一步历史（内核 nudge 同门开放键：靠收口/其它事务断开闭合）
    write(['fontSize'], value, false)
}

// ---- 字色拾色段（原生取色器快捷拾色；拖动 live 合并、change 收口——ColorField 同门） ----

/** 取色器只认 #rrggbb，非 hex 色串（rgba()/命名色）回退黑（文档值原样保留） */
const swatchHex = computed(() => (/^#[0-9a-fA-F]{6}$/.test(props.fontColor) ? props.fontColor : '#000000'))

function onColorInput(event: Event): void {
    write(['fontColor'], (event.target as HTMLInputElement).value, false)
}

function onColorChange(event: Event): void {
    write(['fontColor'], (event.target as HTMLInputElement).value, true)
}

// ---- 对齐两段三键（现值高亮；图标映射 AlignField 同门镜像——域隔离各自持有） ----

const HALIGN_META: Record<HorizontalAlign, { icon: LucideIcon; title: string }> = {
    left: { icon: AlignStartVertical, title: '左对齐' },
    center: { icon: AlignCenterVertical, title: '居中对齐' },
    right: { icon: AlignEndVertical, title: '右对齐' },
}

const VALIGN_META: Record<VerticalAlign, { icon: LucideIcon; title: string }> = {
    top: { icon: AlignStartHorizontal, title: '顶对齐' },
    center: { icon: AlignCenterHorizontal, title: '居中对齐' },
    bottom: { icon: AlignEndHorizontal, title: '底对齐' },
}

const HALIGN_OPTIONS = HORIZONTAL_ALIGNS.map((value) => ({ value, ...HALIGN_META[value] }))
const VALIGN_OPTIONS = VERTICAL_ALIGNS.map((value) => ({ value, ...VALIGN_META[value] }))

function pickAlign(axis: 'horizontal' | 'vertical', value: HorizontalAlign | VerticalAlign): void {
    if (value === (axis === 'horizontal' ? props.horizontalAlign : props.verticalAlign)) return
    // 已选中分段不上报（免冗余历史步，AlignField 同门）；一次点击 = 收口一步
    write(axis === 'horizontal' ? ['align', 'horizontal'] : ['align', 'vertical'], value, true)
}

// ---- 自动换行开关段 ----

function toggleAutowrap(): void {
    write(['autowrap'], !props.autowrap, true)
}
</script>

<template>
    <div
        ref="rootRef"
        class="cn-edit-toolbar"
        role="toolbar"
        aria-label="文本编辑"
        data-edit-toolbar
        @pointerdown.prevent
    >
        <!-- 段 1：内容类型（首段，原 pill 本体）：data-content-pill / data-pill-* 目验
             与测试钩子沿用（模式切换唯一入口，会话期面板锁定段同源随动） -->
        <span class="cn-edit-toolbar__segment" role="group" aria-label="内容类型" data-content-pill>
            <button
                v-for="segment in SEGMENTS"
                :key="segment.value"
                type="button"
                class="cn-edit-toolbar__item"
                :class="{ 'cn-edit-toolbar__item--active': segment.value === mode }"
                :aria-pressed="segment.value === mode"
                :data-pill-static="segment.value === 'static' ? true : undefined"
                :data-pill-expression="segment.value === 'expression' ? true : undefined"
                @click="pick(segment.value)"
            >
                {{ segment.label }}
            </button>
        </span>
        <!-- 段 2：字体下拉（清单注入缝，未注入退化两态；输入件 stop 放行聚焦/开弹层） -->
        <span class="cn-edit-toolbar__segment">
            <select
                class="cn-edit-toolbar__font"
                data-toolbar-font
                :value="font"
                title="字体"
                @pointerdown.stop
                @change="onFontChange"
            >
                <option v-for="option in fontOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                </option>
            </select>
        </span>
        <!-- 段 3：字号步进（读数恒场景像素——屏幕恒定尺寸下与属性面板、终图一致） -->
        <span class="cn-edit-toolbar__segment" role="group" aria-label="字号">
            <button
                type="button"
                class="cn-edit-toolbar__mini"
                data-toolbar-font-size-dec
                title="字号减 1"
                @click="stepSize(-1)"
            >
                <PanelIcon :icon="Minus" :size="11" />
            </button>
            <input
                v-model="sizeDraft"
                class="cn-edit-toolbar__size"
                data-toolbar-font-size
                type="number"
                :min="SIZE_MIN"
                :step="1"
                :aria-label="`字号（场景像素）`"
                title="字号（场景像素）"
                @pointerdown.stop
                @input="onSizeInput"
                @change="onSizeFinish"
                @blur="onSizeFinish"
                @focus="sizeFocused = true"
            />
            <button
                type="button"
                class="cn-edit-toolbar__mini"
                data-toolbar-font-size-inc
                title="字号加 1"
                @click="stepSize(1)"
            >
                <PanelIcon :icon="Plus" :size="11" />
            </button>
        </span>
        <!-- 段 4：字色拾色（输入件 stop 放行聚焦/开取色器） -->
        <span class="cn-edit-toolbar__segment">
            <input
                class="cn-edit-toolbar__color"
                data-toolbar-font-color
                type="color"
                :value="swatchHex"
                aria-label="字色"
                title="字色"
                @pointerdown.stop
                @input="onColorInput"
                @change="onColorChange"
            />
        </span>
        <!-- 段 5/6：水平/垂直对齐三键（现值 accent 高亮，两段三键非九宫格——定稿布局） -->
        <span class="cn-edit-toolbar__segment" role="group" aria-label="水平对齐" data-toolbar-align-horizontal>
            <button
                v-for="option in HALIGN_OPTIONS"
                :key="option.value"
                type="button"
                class="cn-edit-toolbar__item cn-edit-toolbar__icon-item"
                :class="{ 'cn-edit-toolbar__item--active': option.value === horizontalAlign }"
                :aria-pressed="option.value === horizontalAlign"
                :title="`水平对齐：${option.title}`"
                :data-align-h="option.value"
                @click="pickAlign('horizontal', option.value)"
            >
                <PanelIcon :icon="option.icon" :size="12" />
            </button>
        </span>
        <span class="cn-edit-toolbar__segment" role="group" aria-label="垂直对齐" data-toolbar-align-vertical>
            <button
                v-for="option in VALIGN_OPTIONS"
                :key="option.value"
                type="button"
                class="cn-edit-toolbar__item cn-edit-toolbar__icon-item"
                :class="{ 'cn-edit-toolbar__item--active': option.value === verticalAlign }"
                :aria-pressed="option.value === verticalAlign"
                :title="`垂直对齐：${option.title}`"
                :data-align-v="option.value"
                @click="pickAlign('vertical', option.value)"
            >
                <PanelIcon :icon="option.icon" :size="12" />
            </button>
        </span>
        <!-- 段 7：自动换行开关 -->
        <span class="cn-edit-toolbar__segment">
            <button
                type="button"
                class="cn-edit-toolbar__item cn-edit-toolbar__icon-item"
                :class="{ 'cn-edit-toolbar__item--active': autowrap }"
                :aria-pressed="autowrap"
                data-toolbar-autowrap
                title="自动换行"
                @click="toggleAutowrap"
            >
                <PanelIcon :icon="TextWrap" :size="12" />
            </button>
        </span>
    </div>
</template>

<style scoped>
/* 令牌与 ContextMenu 同值：自带主题（暗色检视面），不依赖宿主接线 */
.cn-edit-toolbar {
    --cn-bg-elevated: #101a2e;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-accent: #38bdf8;
    --cn-accent-soft: rgba(56, 189, 248, 0.12);

    position: absolute;
    left: 0;
    top: 0;
    z-index: 30;
    display: inline-flex;
    align-items: stretch;
    gap: 2px;
    padding: 3px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(2, 6, 23, 0.45);
    /* 屏幕恒定尺寸（ADR 0019）：定位换算给屏幕像素（useTextEditing.toolbarStyle），
       自身不再有任何 scale 变换——zoom 只动锚点不动尺寸 */
    /* 透明点击面里的可交互件：工具条本体可点，不阻画布其余事件 */
    pointer-events: auto;
    user-select: none;
}

/* 段间细分隔（样式段视觉分组；段内按键分隔由 item 邻接边负责） */
.cn-edit-toolbar__segment + .cn-edit-toolbar__segment {
    margin-left: 2px;
    padding-left: 3px;
    border-left: 1px solid var(--cn-line);
}

.cn-edit-toolbar__segment {
    display: inline-flex;
    align-items: center;
    overflow: hidden;
    border-radius: 5px;
}

.cn-edit-toolbar__item {
    padding: 3px 10px;
    border: 0;
    background: transparent;
    color: var(--cn-muted);
    font-size: 11px;
    line-height: 1.4;
    white-space: nowrap;
    cursor: pointer;
}

.cn-edit-toolbar__item + .cn-edit-toolbar__item {
    border-left: 1px solid var(--cn-line);
}

.cn-edit-toolbar__item:hover {
    color: var(--cn-fg);
}

.cn-edit-toolbar__item--active {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
    cursor: default;
}

/* 图标键（对齐三键/换行开关）：内容类型段的文字键窄一档 */
.cn-edit-toolbar__icon-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 6px;
}

/* 字体下拉：紧凑暗色（清单外引用由选项面兜底，不撑条） */
.cn-edit-toolbar__font {
    max-width: 110px;
    height: 22px;
    padding: 0 2px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--cn-fg);
    font-size: 11px;
    line-height: 1.4;
    cursor: pointer;
}

.cn-edit-toolbar__font:focus-visible {
    outline: 1px solid var(--cn-accent);
}

.cn-edit-toolbar__font option {
    background: var(--cn-bg-elevated);
    color: var(--cn-fg);
}

/* 字号步进：− / 读数 / + 三件紧凑一排；读数框隐藏原生 spinner（自绘步进键） */
.cn-edit-toolbar__mini {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 4px;
    border: 0;
    background: transparent;
    color: var(--cn-muted);
    cursor: pointer;
}

.cn-edit-toolbar__mini:hover {
    color: var(--cn-fg);
}

.cn-edit-toolbar__size {
    width: 34px;
    height: 20px;
    padding: 0 2px;
    border: 1px solid var(--cn-line);
    border-radius: 4px;
    background: transparent;
    color: var(--cn-fg);
    font-size: 11px;
    line-height: 1.4;
    text-align: center;
    appearance: textfield;
    -moz-appearance: textfield;
}

.cn-edit-toolbar__size::-webkit-outer-spin-button,
.cn-edit-toolbar__size::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
}

.cn-edit-toolbar__size:focus-visible {
    outline: 1px solid var(--cn-accent);
}

/* 字色拾色：原生取色器紧凑方块（色值语义同 ColorField——只吐 #rrggbb） */
.cn-edit-toolbar__color {
    width: 24px;
    height: 20px;
    padding: 0;
    border: 1px solid var(--cn-line);
    border-radius: 4px;
    background: transparent;
    cursor: pointer;
}

.cn-edit-toolbar__color:focus-visible {
    outline: 1px solid var(--cn-accent);
}
</style>
