<script setup lang="ts">
/**
 * EditOverlayToolbar：编辑浮层工具条（canvas-web-edit-overlay-toolbar 工单 03/04，
 * ADR 0019；edit-toolbar-declutter 工票 03 下拉化重排）——内容类型由两键 pill 换为
 * 下拉（shared DropdownMenu 底座，#trigger 受控插槽自绘触发钮），盒内对齐由两段
 * 三键换为同一视觉段内两个独立下拉，全部控件的原生 title 换为 shared Tooltip
 * （工票 01）。七段单行折为六段（内容类型｜字体｜字号｜字色｜对齐组｜自动换行），
 * 纯折叠不重排（spec 决策 6）。
 *
 * - 编辑会话期由 TextEditingOverlay 内挂在图层框上缘中点（翻转/钳制换算在
 *   useTextEditing.toolbarStyle）；选中态不显示（工具条仅编辑会话期存在）。
 *   屏幕恒定尺寸：屏幕坐标定位、无 scale 变换（与 textarea 的场景像素换算系
 *   分叉，浮层定位两套并存），任何缩放级别下可读可点；字号段读数恒为场景像素
 *   值（文档值，不随 zoom 折算）。
 * - 内容类型下拉（spec 决策 1）：触发钮 = 当前态文字（静态/表达式）+ ▾，菜单两
 *   条纯文字项（不造图标——表达式无图标语汇）、当前项打勾（checked）。切换语义
 *   零变化：仅翻会话标志（ui.editing.expression）、零文档变更零历史步，仍是模式
 *   切换唯一入口，会话期面板内容面锁定随动；本组件零状态（ValueTypeSegmented
 *   同门）。
 * - 对齐两下拉（spec 决策 2）：同一视觉段相邻，组内不加分隔线、与前后段保持段
 *   间距；触发钮 = 当前值图标（lucide 物件对齐族，映射沿用现有镜像）+ ▾，菜单项
 *   = 图标 + 常显文字 + 当前项打勾 + 值目验钩子。重复选当前值不上报（零历史步
 *   守卫保留）；一次变更 = updateSpec 收口一步（mergeKey 语义不变）；编辑框实时
 *   联动（textEditLayout 现算，零改动）。
 * - 五组样式段（工单 04）：显示值全部来自 props（TextEditingOverlay 投影内核
 *   textEditLayout——面板/工具条双入口同源，state 无分叉）；写入上抛 style 归
 *   绑定层 updateStyleField（面板同门权威写：updateSpec + `sel:path:key`
 *   mergeKey，新层样式槽随权威写自动捕获）。合并语义与面板一致——select/change
 *   类一次点击 = final 收口一步；拾色拖动 input live 合并、change 收口；字号
 *   步进连续点按合并（nudge 同门开放键）。本组件零状态（字号输入草稿除外）。
 * - 触发钮归输入件同门（@pointerdown.stop 放行夺焦，spec 决策 5）——时序约束：
 *   窗口捕获桥 pointerdown 置 blur 豁免、pointerup 复位；若走按钮类 root.prevent
 *   路径（不夺焦），click → 开菜单 → 焦点入菜单发生在复位之后，textarea 的 blur
 *   将越过豁免窗触发延迟提交、会话当场退出。stop 放行使夺焦 blur 落在豁免窗内
 *   （字体下拉/拾色器既有同门）。.stop 只阻断根的 preventDefault，不阻断窗口
 *   捕获桥（capture 先于目标段）——豁免判定（ownsEventTarget 覆盖整条工具条）
 *   仍由表面组件 pointerdown 处理器亲见。
 *   已知组合面（工票 01 消费备注的呈现面）：Tooltip focusin 即时出泡，鼠标点触
 *   发钮会出现「pointerdown 隐 → 夺焦 focusin 再显」的一帧回显，菜单分发回焦触
 *   发钮时气泡即时现出（焦点在哪提示跟到哪，是 Tooltip 的键盘可达设计）；气泡
 *   pointer-events:none 不劫持指针，与下拉的交互语义无冲突。
 * - data-* 目验钩子映射（spec 决策 7）：data-content-pill 段上不动；
 *   data-pill-static/expression → 内容类型菜单项；data-toolbar-align-horizontal/
 *   vertical → 对齐轴触发钮（语义从「段」改挂「轴触发钮」）；data-align-h/v=<值>
 *   → 对齐菜单项；data-toolbar-font / -font-size(-dec/-inc) / -font-color /
 *   -autowrap 不动。
 * - 无障碍（spec 决策 8）：原生 title 清零，全部控件接 Tooltip（悬停 + 键盘聚焦
 *   出泡、aria-describedby 随显隐写摘）；自动换行开关 aria-pressed 保留；菜单项
 *   可勾选态 role=menuitemradio + aria-checked 由底座按 checked 字段渲染（工票 02）。
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

import DropdownMenu from '../shared/DropdownMenu.vue'
import { injectFontPicker } from '../shared/fontPicker'
import PanelIcon from '../shared/PanelIcon.vue'
import Tooltip from '../shared/Tooltip.vue'
import type { DropdownMenuEntry } from '../shared/useDropdownMenu'

const props = defineProps<{
    /** 当前会话模式（ui.editing.expression 投影）：触发钮文字与菜单勾选随之 */
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

// ---- 内容类型下拉段（工票 03：两键 pill 原地换装下拉，菜单项 = 原 pill 键面） ----

/** 两项静态定义（原 pill 的段定义原地收编为菜单项源）：label 是唯一文案源——
 *  触发钮当前态文字（modeLabel）与菜单项同查此表，改文案只动这一处 */
const MODES: readonly { value: 'static' | 'expression'; label: string }[] = [
    { value: 'static', label: '静态' },
    { value: 'expression', label: '表达式' },
]

/** 触发钮文字 = 当前项 label（自 MODES 查表派生，不另设文案字面量） */
const modeLabel = computed(() => MODES.find((mode) => mode.value === props.mode)?.label ?? props.mode)

/** 菜单项：纯文字 + 当前项打勾；data-pill-* 目验钩子自段移挂菜单项（spec 决策 7） */
const contentTypeItems = computed<DropdownMenuEntry[]>(() =>
    MODES.map((mode) => ({
        label: mode.label,
        checked: mode.value === props.mode,
        dataAttrs: { [`data-pill-${mode.value}`]: 'true' },
        run: () => pick(mode.value),
    })),
)

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

// ---- 对齐组两下拉（工票 03：两段三键收编为同组两下拉；图标映射 AlignField 同门镜像——域隔离各自持有） ----

const HALIGN_META: Record<HorizontalAlign, { icon: LucideIcon; label: string }> = {
    left: { icon: AlignStartVertical, label: '左对齐' },
    center: { icon: AlignCenterVertical, label: '居中对齐' },
    right: { icon: AlignEndVertical, label: '右对齐' },
}

const VALIGN_META: Record<VerticalAlign, { icon: LucideIcon; label: string }> = {
    top: { icon: AlignStartHorizontal, label: '顶对齐' },
    center: { icon: AlignCenterHorizontal, label: '居中对齐' },
    bottom: { icon: AlignEndHorizontal, label: '底对齐' },
}

/** 菜单项：图标 + 常显文字 + 当前项打勾；data-align-h/v=<值> 钩子挂菜单项（spec 决策 7） */
const hAlignItems = computed<DropdownMenuEntry[]>(() =>
    HORIZONTAL_ALIGNS.map((value) => ({
        label: HALIGN_META[value].label,
        icon: HALIGN_META[value].icon,
        checked: value === props.horizontalAlign,
        dataAttrs: { 'data-align-h': value },
        run: () => pickAlign('horizontal', value),
    })),
)

const vAlignItems = computed<DropdownMenuEntry[]>(() =>
    VERTICAL_ALIGNS.map((value) => ({
        label: VALIGN_META[value].label,
        icon: VALIGN_META[value].icon,
        checked: value === props.verticalAlign,
        dataAttrs: { 'data-align-v': value },
        run: () => pickAlign('vertical', value),
    })),
)

/** 触发钮当前值图标（不展开菜单即可读出当前对齐状态，spec 故事 3） */
const hAlignIcon = computed(() => HALIGN_META[props.horizontalAlign].icon)
const vAlignIcon = computed(() => VALIGN_META[props.verticalAlign].icon)

function pickAlign(axis: 'horizontal' | 'vertical', value: HorizontalAlign | VerticalAlign): void {
    if (value === (axis === 'horizontal' ? props.horizontalAlign : props.verticalAlign)) return
    // 已选中值不上报（免冗余历史步，AlignField 同门）；一次变更 = 收口一步
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
        <!-- 段 1：内容类型下拉（首段，原 pill 本体换装；工票 03）：data-content-pill
             目验钩子留段上（spec 决策 7），data-pill-* 移挂菜单项。触发钮经 #trigger
             受控插槽自绘（当前态文字 + ▾，a11y 两属性由消费方写）——@pointerdown.stop
             归输入件同门放行夺焦（见头注时序约束） -->
        <span class="cn-edit-toolbar__segment" role="group" aria-label="内容类型" data-content-pill>
            <DropdownMenu label="内容类型" :items="contentTypeItems">
                <template #trigger="{ open, toggle, triggerRef, onKeydown }">
                    <Tooltip label="内容类型">
                        <button
                            :ref="triggerRef"
                            type="button"
                            class="cn-edit-toolbar__item cn-edit-toolbar__menu-trigger"
                            aria-haspopup="menu"
                            :aria-expanded="open"
                            @pointerdown.stop
                            @click="toggle"
                            @keydown="onKeydown"
                        >
                            {{ modeLabel }}
                            <span class="cn-edit-toolbar__caret" aria-hidden="true">▾</span>
                        </button>
                    </Tooltip>
                </template>
            </DropdownMenu>
        </span>
        <!-- 段 2：字体下拉（清单注入缝，未注入退化两态；输入件 stop 放行聚焦/开弹层） -->
        <span class="cn-edit-toolbar__segment">
            <Tooltip label="字体">
                <select
                    class="cn-edit-toolbar__font"
                    data-toolbar-font
                    :value="font"
                    aria-label="字体"
                    @pointerdown.stop
                    @change="onFontChange"
                >
                    <option v-for="option in fontOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
            </Tooltip>
        </span>
        <!-- 段 3：字号步进（读数恒场景像素——屏幕恒定尺寸下与属性面板、终图一致） -->
        <span class="cn-edit-toolbar__segment" role="group" aria-label="字号">
            <Tooltip label="字号减 1">
                <button
                    type="button"
                    class="cn-edit-toolbar__mini"
                    data-toolbar-font-size-dec
                    aria-label="字号减 1"
                    @click="stepSize(-1)"
                >
                    <PanelIcon :icon="Minus" :size="11" />
                </button>
            </Tooltip>
            <Tooltip label="字号（场景像素）">
                <input
                    v-model="sizeDraft"
                    class="cn-edit-toolbar__size"
                    data-toolbar-font-size
                    type="number"
                    :min="SIZE_MIN"
                    :step="1"
                    :aria-label="`字号（场景像素）`"
                    @pointerdown.stop
                    @input="onSizeInput"
                    @change="onSizeFinish"
                    @blur="onSizeFinish"
                    @focus="sizeFocused = true"
                />
            </Tooltip>
            <Tooltip label="字号加 1">
                <button
                    type="button"
                    class="cn-edit-toolbar__mini"
                    data-toolbar-font-size-inc
                    aria-label="字号加 1"
                    @click="stepSize(1)"
                >
                    <PanelIcon :icon="Plus" :size="11" />
                </button>
            </Tooltip>
        </span>
        <!-- 段 4：字色拾色（输入件 stop 放行聚焦/开取色器） -->
        <span class="cn-edit-toolbar__segment">
            <Tooltip label="字色">
                <input
                    class="cn-edit-toolbar__color"
                    data-toolbar-font-color
                    type="color"
                    :value="swatchHex"
                    aria-label="字色"
                    @pointerdown.stop
                    @input="onColorInput"
                    @change="onColorChange"
                />
            </Tooltip>
        </span>
        <!-- 段 5：对齐组（工票 03：两下拉相邻同组，组内不加分隔线；触发钮 = 当前值
             图标 + ▾，轴 aria-label 与 data-toolbar-align-* 钩子挂触发钮；菜单项 =
             图标 + 文字 + 当前项打勾，data-align-h/v=<值> 挂菜单项）。触发钮同为
             输入件同门（@pointerdown.stop 放行夺焦，见头注时序约束） -->
        <span class="cn-edit-toolbar__segment cn-edit-toolbar__align-group" role="group" aria-label="对齐">
            <DropdownMenu label="水平对齐" :items="hAlignItems">
                <template #trigger="{ open, toggle, triggerRef, onKeydown }">
                    <Tooltip label="水平对齐">
                        <button
                            :ref="triggerRef"
                            type="button"
                            class="cn-edit-toolbar__item cn-edit-toolbar__icon-item cn-edit-toolbar__menu-trigger"
                            data-toolbar-align-horizontal
                            aria-label="水平对齐"
                            aria-haspopup="menu"
                            :aria-expanded="open"
                            @pointerdown.stop
                            @click="toggle"
                            @keydown="onKeydown"
                        >
                            <PanelIcon :icon="hAlignIcon" :size="12" />
                            <span class="cn-edit-toolbar__caret" aria-hidden="true">▾</span>
                        </button>
                    </Tooltip>
                </template>
            </DropdownMenu>
            <DropdownMenu label="垂直对齐" :items="vAlignItems">
                <template #trigger="{ open, toggle, triggerRef, onKeydown }">
                    <Tooltip label="垂直对齐">
                        <button
                            :ref="triggerRef"
                            type="button"
                            class="cn-edit-toolbar__item cn-edit-toolbar__icon-item cn-edit-toolbar__menu-trigger"
                            data-toolbar-align-vertical
                            aria-label="垂直对齐"
                            aria-haspopup="menu"
                            :aria-expanded="open"
                            @pointerdown.stop
                            @click="toggle"
                            @keydown="onKeydown"
                        >
                            <PanelIcon :icon="vAlignIcon" :size="12" />
                            <span class="cn-edit-toolbar__caret" aria-hidden="true">▾</span>
                        </button>
                    </Tooltip>
                </template>
            </DropdownMenu>
        </span>
        <!-- 段 6：自动换行开关（纯按钮：根拦 pointerdown 不夺焦，aria-pressed 保留） -->
        <span class="cn-edit-toolbar__segment">
            <Tooltip label="自动换行">
                <button
                    type="button"
                    class="cn-edit-toolbar__item cn-edit-toolbar__icon-item"
                    :class="{ 'cn-edit-toolbar__item--active': autowrap }"
                    :aria-pressed="autowrap"
                    data-toolbar-autowrap
                    aria-label="自动换行"
                    @click="toggleAutowrap"
                >
                    <PanelIcon :icon="TextWrap" :size="12" />
                </button>
            </Tooltip>
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

/* 对齐组（工票 03）：两下拉相邻同组，组内不加分隔线，仅留呼吸空隙 */
.cn-edit-toolbar__align-group {
    gap: 2px;
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

.cn-edit-toolbar__item:hover {
    color: var(--cn-fg);
}

.cn-edit-toolbar__item--active {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
    cursor: default;
}

/* 图标键（换行开关/对齐触发钮）：文字键窄一档 */
.cn-edit-toolbar__icon-item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 3px 6px;
}

/* 下拉触发钮（工票 03）：当前值/当前态 + ▾ 指示的同排小组合 */
.cn-edit-toolbar__menu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 3px;
}

.cn-edit-toolbar__caret {
    font-size: 10px;
    line-height: 1;
    color: var(--cn-muted);
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
