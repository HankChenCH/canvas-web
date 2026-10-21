<script lang="ts">
/**
 * 模块级状态（plain script 块——script setup 顶层绑定是每实例重建的，且
 * withDefaults 的缺省值对象会被编译期提出 setup()，只能引用模块级绑定）。
 */
/** 悬停延迟档缺省值（ms）：spec「约 300ms」——原生 title 约 1s 的感知问题由短档解决 */
const TOOLTIP_DEFAULT_DELAY_MS = 300
/** 气泡 id 序数：同实例开合复用同 id（稳定）、跨实例唯一（同页多 Tooltip
 *  aria-describedby 不撞号）；包内无 SSR 面，无 hydration 前后一致性诉求 */
let tooltipSeq = 0
</script>

<script setup lang="ts">
/**
 * Tooltip：悬停/聚焦延迟气泡提示（edit-toolbar-declutter 工票 01，spec 决策 4）。
 * 包裹任意控件后，悬停满延迟档或键盘聚焦弹出深色纯文本气泡；离开/失焦/按下
 * 即隐。零消费方交付（消费在工票 03/04：编辑浮层工具条 / 属性面板对齐段 /
 * 图层面板行内动作），统一替代原生 title。
 *
 * - 触发：mouseenter（悬停）经延迟档出泡（缺省 300ms，props 可调）；focusin
 *   （键盘聚焦）即时出泡——键盘用户不等延迟；
 * - 隐藏三路：mouseleave / focusout / pointerdown。pointerdown 监听挂 wrapper
 *   **capture** 段：工具条按钮类控件由根拦 pointerdown（root.prevent 路径）、
 *   下拉触发钮等输入件类 @pointerdown.stop 放行夺焦——capture 先于两者的目标/
 *   冒泡段，两种形态下气泡都隐藏（spec 决策 4/5 的关键时序）；
 * - 气泡 Teleport 到 body、fixed 定位复用 shared popupPosition 纯函数
 *   （placePopupInViewport：下方优先、放不下上翻、视口钳位）：首帧按 wrapper
 *   rect + 零尺寸落锚（免测高），渲染后按气泡实际尺寸补钳位——尺寸量不到
 *   （0）时纯函数按「放得下/原锚放」处理，不误翻转（降级路径，jsdom 恒走此
 *   路，组件测试钉住）。换算只在出泡时发生一次，pan/resize 不跟随（瞬时浮示
 *   可接受，DropdownMenu 弹层同例）；**宿主前提**：wrapper 祖先链不得有
 *   transform/filter——会劫持 fixed 包含块致错位（DropdownMenu 同款前提）。
 * - 无障碍：气泡 role=tooltip + 稳定 id（模块序数生成——同实例开合复用、跨
 *   实例唯一；包内无 SSR 面，useId 跨应用同 id 反而撞号）；显示时给被包裹控件
 *   （wrapper 首个元素子节点）写 aria-describedby 指向气泡 id、隐藏时摘除
 *   （spec 决策 4；控件已有 aria-describedby 的场景本工票不涉及——工票 03/04
 *   消费控件均为 aria-label + 本次接线，无并存值）。
 * - 气泡 pointer-events: none（被动浮示，不劫持指针）；z-50 在 DropdownMenu
 *   弹层（z-40）及其 submenu（z-41）之上。两者与暗色主题令牌一样归样式表面，
 *   jsdom 不算样式表不可断言（DropdownMenu z-40 先例同注）。
 *
 * 样式自带令牌（与菜单/右键菜单同族暗色面）：令牌直接定义在气泡元素上——
 * 气泡 Teleport 出 wrapper 子树后不再是 .cn-tooltip 后代，令牌必须随元素走，
 * 不依赖宿主接线也不渗漏。data-tooltip 钩子供测试/目验定位。
 */
import { nextTick, onUnmounted, ref } from 'vue'

import { placePopupInViewport } from './popupPosition'

const props = withDefaults(
    defineProps<{
        /** 气泡文案（纯文本；富内容不做，spec Out of Scope） */
        label: string
        /** 悬停延迟毫秒（键盘聚焦即时显示不走本档）；缺省 300 */
        delay?: number
    }>(),
    { delay: TOOLTIP_DEFAULT_DELAY_MS },
)

defineOptions({ inheritAttrs: false })

const wrapperEl = ref<HTMLElement | null>(null)
const bubbleEl = ref<HTMLElement | null>(null)
const visible = ref(false)
/** 气泡视口坐标（fixed 内联 style）：首帧锚 + 渲染后按实际尺寸补钳位 */
const position = ref({ top: 0, left: 0 })
/** 气泡稳定 id（aria-describedby 关联目标；同一实例开合复用，跨实例唯一） */
const tooltipId = `cn-tooltip-${++tooltipSeq}`

let hoverTimer: ReturnType<typeof setTimeout> | null = null

function clearHoverTimer(): void {
    if (hoverTimer !== null) {
        clearTimeout(hoverTimer)
        hoverTimer = null
    }
}

/** 被包裹控件 = wrapper 首个元素子节点（气泡 Teleport 出去后 wrapper 子树只剩 slot） */
function wrappedControl(): Element | null {
    return wrapperEl.value?.firstElementChild ?? null
}

/** 出泡：首帧按 wrapper rect + 零尺寸落锚（免测高），渲染后按气泡实际尺寸补
 *  钳位；等待期间已被收起的竞态兜底不补。显示同时给被包裹控件写
 *  aria-describedby（无障碍接线，隐藏时摘除） */
async function show(): Promise<void> {
    const anchorRect = wrapperEl.value?.getBoundingClientRect()
    if (anchorRect) {
        position.value = placePopupInViewport({
            anchor: { top: anchorRect.top, bottom: anchorRect.bottom, left: anchorRect.left },
            popupWidth: 0,
            popupHeight: 0,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
        })
    }
    visible.value = true
    wrappedControl()?.setAttribute('aria-describedby', tooltipId)
    await nextTick()
    if (!visible.value || anchorRect === undefined) return
    const bubbleRect = bubbleEl.value?.getBoundingClientRect()
    if (bubbleRect === undefined) return
    position.value = placePopupInViewport({
        anchor: { top: anchorRect.top, bottom: anchorRect.bottom, left: anchorRect.left },
        popupWidth: bubbleRect.width,
        popupHeight: bubbleRect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
    })
}

/** 隐：清挂起的悬停定时器 + 摘 aria-describedby（挂起期隐 = 定时器作废不出泡） */
function hide(): void {
    clearHoverTimer()
    if (!visible.value) return
    visible.value = false
    wrappedControl()?.removeAttribute('aria-describedby')
}

/** 悬停武装延迟档；重复进入重置（清旧定时器再挂） */
function onEnter(): void {
    clearHoverTimer()
    hoverTimer = setTimeout(() => {
        hoverTimer = null
        void show()
    }, props.delay)
}

/** 键盘聚焦即时出泡：清挂起的悬停定时器（focus 已到不等延迟档） */
function onFocusIn(): void {
    clearHoverTimer()
    void show()
}

onUnmounted(clearHoverTimer)
</script>

<template>
    <!-- 单根 wrapper（Teleport 内置其中，气泡本体仍落 body——firstElementChild
         恒为 slot 控件，VTU/目验以 wrapper 为组件根也无歧义） -->
    <div
        ref="wrapperEl"
        class="cn-tooltip"
        v-bind="$attrs"
        @mouseenter="onEnter"
        @mouseleave="hide()"
        @focusin="onFocusIn"
        @focusout="hide()"
        @pointerdown.capture="hide()"
    >
        <slot />
        <Teleport to="body">
            <div
                v-if="visible"
                :id="tooltipId"
                ref="bubbleEl"
                role="tooltip"
                class="cn-tooltip__bubble"
                data-tooltip
                :style="{ top: `${position.top}px`, left: `${position.left}px` }"
            >
                {{ label }}
            </div>
        </Teleport>
    </div>
</template>

<style scoped>
/* wrapper：控件包裹层，缺省 inline-flex（flex 行/文本流两栖，面板宫格等布局
   适配经 attrs 透传的 class 覆盖，如 flex-1） */
.cn-tooltip {
    display: inline-flex;
}

/* 气泡：暗色抬升面（菜单/右键菜单同族令牌）。令牌定义在气泡自身——Teleport
   出 wrapper 后不继承 .cn-tooltip 上的任何值；fixed + 内联视口坐标（见组件
   头注「fixed 定位」）；pointer-events: none 被动浮示不劫持指针；z-50 在
   DropdownMenu 弹层（z-40）/submenu（z-41）之上 */
.cn-tooltip__bubble {
    --cn-fg: #e6edf7;
    --cn-line: #1e2a40;
    --cn-bg-elevated: #101a2e;

    position: fixed;
    z-index: 50;
    pointer-events: none;
    padding: 4px 8px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 6px;
    box-shadow: 0 4px 16px rgba(2, 6, 23, 0.4);
    color: var(--cn-fg);
    font-size: 12px;
    line-height: 1.4;
    white-space: nowrap;
}
</style>
