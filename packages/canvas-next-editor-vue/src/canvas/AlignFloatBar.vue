<script setup lang="ts">
/**
 * AlignFloatBar：画布域「对齐画布」浮条（layer-align-snap 工单 02，ADR 0011）。
 *
 * 三段分组 10 键：居中×2 ｜ 贴边×4 ｜ 贴角×4（段间分隔线）。常显，未选中
 * 整条置灰禁用（键 disabled + 根 aria-disabled，布局不随选择跳变）。点击
 * 直调内核 `editor.alignToCanvas(选中 path, mode)`——corner 系显式传缺省
 * 边距 ALIGN_CORNER_MARGIN_PX（40，贴边零边距、居中无边距概念）；未选中
 * 点击空转（防御，键已 disabled）。与属性面板「盒内对齐」（写 align 字段）
 * 是两类动作，并存不回退。
 *
 * 图标与 AlignField 同族（lucide 物件对齐族，轴线所在侧即对齐侧；居中/贴边
 * 六键与 AlignField 取同一图标）；贴角四键 lucide 无对齐族对应物，取指向
 * 同角箭头（Arrow* 系，同描边语言）。逐键 data-align-* 目验钩子（工单 03
 * playground 自动化锚点）。
 *
 * 组件自身不含页面定位——挂载位置与浮动定位归宿主（工单 03：画布顶部居中；
 * 与缩放浮条的宿主壳落位是已钉决策，两浮条不互搬）。
 */
import type { LucideIcon } from '@lucide/vue'
import {
    AlignCenterHorizontal,
    AlignCenterVertical,
    AlignEndHorizontal,
    AlignEndVertical,
    AlignStartHorizontal,
    AlignStartVertical,
    ArrowDownLeft,
    ArrowDownRight,
    ArrowUpLeft,
    ArrowUpRight,
} from '@lucide/vue'
import { computed } from 'vue'

import {
    ALIGN_CORNER_MARGIN_PX,
    type AlignToCanvasMode,
    type EditorSession,
} from '@hankchen/canvas-next-editor'

import PanelIcon from '../shared/PanelIcon.vue'
import { useSelection } from '../shared/useSelection'

const props = defineProps<{ editor: EditorSession }>()

const selection = useSelection(props.editor)
const hasSelection = computed(() => selection.value !== null)

interface AlignKey {
    readonly mode: AlignToCanvasMode
    readonly icon: LucideIcon
    readonly title: string
}

interface AlignGroup {
    readonly keys: readonly AlignKey[]
}

/** 贴角标题统一带边距提示（四角同一取值） */
const cornerTitle = (label: string): string => `贴${label}角（边距 ${ALIGN_CORNER_MARGIN_PX}px）`

/** 三段分组（spec 决策 2 的键序）：居中×2 ｜ 贴边×4 ｜ 贴角×4 */
const GROUPS: readonly AlignGroup[] = [
    {
        keys: [
            { mode: 'h-center', icon: AlignCenterVertical, title: '水平居中' },
            { mode: 'v-center', icon: AlignCenterHorizontal, title: '垂直居中' },
        ],
    },
    {
        keys: [
            { mode: 'left', icon: AlignStartVertical, title: '贴左' },
            { mode: 'right', icon: AlignEndVertical, title: '贴右' },
            { mode: 'top', icon: AlignStartHorizontal, title: '贴顶' },
            { mode: 'bottom', icon: AlignEndHorizontal, title: '贴底' },
        ],
    },
    {
        keys: [
            { mode: 'corner-tl', icon: ArrowUpLeft, title: cornerTitle('左上') },
            { mode: 'corner-tr', icon: ArrowUpRight, title: cornerTitle('右上') },
            { mode: 'corner-bl', icon: ArrowDownLeft, title: cornerTitle('左下') },
            { mode: 'corner-br', icon: ArrowDownRight, title: cornerTitle('右下') },
        ],
    },
]

/** 逐键 data-align-* 钩子（工单 03 目验自动化锚点） */
function alignHook(mode: AlignToCanvasMode): Record<string, string> {
    return { [`data-align-${mode}`]: '' }
}

function align(mode: AlignToCanvasMode): void {
    const path = selection.value
    if (!path) return
    if (mode.startsWith('corner-')) {
        props.editor.alignToCanvas(path, mode, { margin: ALIGN_CORNER_MARGIN_PX })
    } else {
        props.editor.alignToCanvas(path, mode)
    }
}
</script>

<template>
    <div
        class="cn-align-float"
        :class="{ 'cn-align-float--disabled': !hasSelection }"
        role="toolbar"
        aria-label="对齐画布"
        data-align-float
        :aria-disabled="hasSelection ? undefined : 'true'"
    >
        <template v-for="(group, index) in GROUPS" :key="index">
            <span v-if="index > 0" class="cn-align-float__divider" aria-hidden="true"></span>
            <span class="cn-align-float__group">
                <button
                    v-for="key in group.keys"
                    :key="key.mode"
                    type="button"
                    class="cn-align-float__key"
                    :disabled="!hasSelection"
                    :title="key.title"
                    :aria-label="key.title"
                    v-bind="alignHook(key.mode)"
                    @click="align(key.mode)"
                >
                    <PanelIcon :icon="key.icon" />
                </button>
            </span>
        </template>
    </div>
</template>

<style scoped>
/* 令牌与 panel-theme.css 同值：浮条自带主题（暗色检视面），不依赖宿主接线；
   底色/描边/毛玻璃沿原型 FIG.2 .float 观感（工单 04 缩放浮条同款层次，hover
   底 #16223a 亦出原型 .float .zb:hover，非面板令牌）。
   不含页面定位——挂载位置归宿主（工单 03）。 */
.cn-align-float {
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-field-line: #2a3a57;
    --cn-accent: #38bdf8;
    --cn-hover: #16223a;

    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    background: rgb(11 18 32 / 0.92);
    border: 1px solid var(--cn-field-line);
    border-radius: 9px;
    box-shadow: 0 10px 26px rgb(0 0 0 / 0.45);
    backdrop-filter: blur(4px);
    color: var(--cn-fg);
    user-select: none;
}

.cn-align-float__group {
    display: flex;
    align-items: center;
    gap: 2px;
}

.cn-align-float__divider {
    width: 1px;
    height: 16px;
    background: var(--cn-field-line);
}

.cn-align-float__key {
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

.cn-align-float__key:hover:not(:disabled) {
    background: var(--cn-hover);
    color: var(--cn-accent);
}

/* 未选中整条置灰：键文字降为 muted（键已 disabled，hover 不响应） */
.cn-align-float--disabled {
    color: var(--cn-muted);
}

.cn-align-float--disabled .cn-align-float__key {
    color: var(--cn-muted);
    cursor: not-allowed;
}
</style>
