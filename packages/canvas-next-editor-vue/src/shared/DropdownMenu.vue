<script setup lang="ts">
/**
 * DropdownMenu：轻量下拉菜单底座（editor-top-toolbar 工单 02）——触发钮 + 弹层
 * 菜单一体的呈现件，供工具栏三下拉（＋插入▾/排列▾/视图▾，issues/03）使用。
 *
 * - 开合与收起逻辑在 useDropdownMenu（另有单测）：触发钮点击开合；开时点外收
 *   （容器包含判定）、Esc 收（window keydown，开态才挂监听）；
 * - a11y 对齐状态栏缩放菜单先例（StatusBar.vue）：触发钮 aria-haspopup=
 *   "menu" + :aria-expanded，菜单 role="menu" + 项 role="menuitem"；
 * - 菜单项契约见 DropdownMenuItem：shortcut 为纯展示键位后缀（右侧灰字，平台
 *   文案由调用方传入）；title 承载置灰原因（「置灰 + title」统一先例
 *   ContextMenu.vue）；'separator' 条目渲染分段分隔线（排列▾/视图▾ 各需一段）；
 * - 分发即收（选中动作后菜单收 + 回焦触发钮，APG menu button 惯例）；keepsOpen
 *   语义不做（spec Q12）。
 * - 键盘导航（issues/04）：开时焦点入菜单（首个启用项，全置灰兜底落菜单根
 *   tabindex=-1）；菜单内 ↑↓ 循环移动、Home/End 首尾，**跳过置灰项**（原生
 *   disabled 不可聚焦，拍板记 issues/04 Comments）；Enter/Space 显式激活
 *   （preventDefault 抑制原生 click——Space 的 keyup click / Enter 的 keydown
 *   click——防双跑，且路径可被 jsdom 钉住）；Esc/Tab 收起并先把焦点送回触发钮
 *   （幸免菜单卸载焦点坠 body；点外收路径不在此列——焦点归用户点击落点），
 *   Tab 不 preventDefault，浏览器原生 Tab 随即自触发钮继续移焦（触发钮非
 *   Tab 终态，APG 同例）。
 *   菜单根 @keydown.stop：焦点在菜单内时按键不再到 window——画布手势/微调不
 *   感知（与 useShortcuts 让路规则双保险：焦点在钮上分类器本就 yield）；
 *   typeahead 不做（issues/04 拍板可选）。触发钮 ↓ 开菜单（Enter/Space 走
 *   原生钮激活语义经 click 开合，底座不另拦）。
 * - 弹层 fixed 定位（issues/03 集成）：宿主工具栏是 overflow-x:auto 内滚容器，
 *   absolute 弹层会被其裁切——fixed 后代不受 overflow 祖先影响（壳内无
 *   transform/filter 祖先，无 containing block 例外）。打开时按触发钮 rect 取
 *   「下缘 + 间隙」起点（首帧即落位），渲染后按实际尺寸钳位进视口（右缘的
 *   视图▾ 必须收回，ContextMenu openAt 同款：换算只在打开时发生一次，
 *   pan/resize 不跟随——瞬时弹层可接受）。
 *
 * 样式自带令牌（与 panel-theme.css 同值）：触发钮 ghost 形态沿 playground
 * 工具栏钮观感（App.vue .toolbar button），菜单壳沿状态栏缩放菜单/右键菜单
 * （暗色抬升面 + accent 悬停）；自带主题不依赖宿主接线，也不渗漏。向下弹出
 * （工具栏下拉自顶栏向下开）。data-dropdown-* 钩子供目验定位（issues/03）。
 */
import { nextTick, ref } from 'vue'

import { nextEnabledItemIndex, useDropdownMenu, type DropdownMenuEntry, type DropdownMenuItem, type MenuFocusKey } from './useDropdownMenu'

const props = defineProps<{
    /** 触发钮文案（▾ 收合指示组件自带）+ 菜单 aria-label */
    label: string
    items: readonly DropdownMenuEntry[]
    /** 触发钮悬停说明；缺省回落 label */
    title?: string
}>()

/** 弹层与触发钮的屏幕间隙（原 CSS top: calc(100% + 6px) 的 6px） */
const MENU_GAP_PX = 6
/** 视口钳位的屏幕边距（ContextMenu openAt 同值） */
const VIEWPORT_MARGIN_PX = 2

const container = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const { open, toggle, closeMenu } = useDropdownMenu({ container })

/** 弹层视口坐标（fixed 内联 style，开态首帧即落位） */
const menuPosition = ref({ left: 0, top: 0 })

/** 收起回焦触发钮：点外收（composable window 监听路径）不回焦——焦点归用户
 *  点击落点；其余组件内发起的收起（激活/Esc/Tab/触发钮点收）都回焦 */
function focusTrigger(): void {
    triggerEl.value?.focus()
}

/** 开时焦点入菜单：首个启用项，全置灰兜底落菜单根（tabindex=-1 可编程聚焦）；
 *  等待期间已被收起的竞态兜底不落焦 */
async function focusIntoMenu(): Promise<void> {
    await nextTick()
    if (!open.value) return
    const menu = menuEl.value
    if (menu === null) return
    const first = menu.querySelector<HTMLElement>('[data-dropdown-item]:not([disabled])')
    ;(first ?? menu).focus()
}

/** 非 separator 条目（DOM 项序与过滤序一致，激活分发与导航同源） */
function itemEntries(): DropdownMenuItem[] {
    return props.items.filter((entry): entry is DropdownMenuItem => entry !== 'separator')
}

/** 菜单项元素（DOM 序，导航落点与激活分发共用同一查询） */
function menuItemEls(): HTMLElement[] {
    return Array.from(menuEl.value?.querySelectorAll<HTMLElement>('[data-dropdown-item]') ?? [])
}

/** 分发即收（ContextMenu 动作即关同款；keepsOpen 本期不做）+ 回焦触发钮 */
function run(item: DropdownMenuItem): void {
    item.run()
    closeMenu()
    focusTrigger()
}

/** 菜单内导航（↑↓/Home/End）：落点计算在 nextEnabledItemIndex 纯函数（有单测），
 *  全置灰返回 -1 时焦点回菜单根 */
function moveMenuFocus(key: MenuFocusKey): void {
    const menu = menuEl.value
    if (menu === null) return
    const els = menuItemEls()
    const enabled = els.map((el) => !el.hasAttribute('disabled'))
    const current = document.activeElement instanceof HTMLElement ? els.indexOf(document.activeElement) : -1
    const next = nextEnabledItemIndex(enabled, current, key)
    if (next === -1) {
        menu.focus()
        return
    }
    els[next]?.focus()
}

/** 键盘激活焦点项：run（内含收起 + 回焦）；置灰项不可聚焦，防御性再判 */
function activateItem(target: HTMLElement): void {
    const entry = itemEntries()[menuItemEls().indexOf(target)]
    if (entry !== undefined && !entry.disabled) run(entry)
}

/** 菜单根按键路由（@keydown.stop：菜单内按键模态化，不到 window）。Enter/Space
 *  显式激活并 preventDefault——抑制原生钮激活（Space keyup click / Enter keydown
 *  click）防双跑 */
function onMenuKeydown(event: KeyboardEvent): void {
    const key = event.key
    if (key === 'Escape' || key === 'Tab') {
        // 收起并先把焦点送回触发钮（幸免菜单 v-if 卸载时焦点坠 body）。Tab 不
        // preventDefault——浏览器原生 Tab 随即自触发钮继续移焦，触发钮非终态
        closeMenu()
        focusTrigger()
        return
    }
    if (key === 'Enter' || key === ' ') {
        const target = event.target
        if (target instanceof HTMLElement && target.matches('[data-dropdown-item]')) {
            event.preventDefault()
            activateItem(target)
        }
        return
    }
    if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
        event.preventDefault()
        moveMenuFocus(key)
    }
    // 其余按键吞掉（.stop 已阻断到 window）：焦点态菜单的模态键盘语义
}

/** 触发钮 ↓ 开菜单（键盘开菜单入口）；已开（指针开菜单后焦点仍在触发钮的
 *  环境）直接把焦点送入菜单 */
function onTriggerArrowDown(): void {
    if (!open.value) {
        void onToggle()
        return
    }
    void focusIntoMenu()
}

/** 点击开合 + 打开时定位：同步取触发钮 rect 落首帧坐标，渲染后按实际尺寸钳位；
 *  开时焦点入菜单，收起回焦触发钮 */
async function onToggle(): Promise<void> {
    if (!open.value) {
        const rect = triggerEl.value?.getBoundingClientRect()
        if (rect) menuPosition.value = { left: rect.left, top: rect.bottom + MENU_GAP_PX }
    }
    toggle()
    if (!open.value) {
        focusTrigger()
        return
    }
    await nextTick()
    const rect = menuEl.value?.getBoundingClientRect()
    if (!rect) return
    menuPosition.value = {
        left: Math.max(VIEWPORT_MARGIN_PX, Math.min(menuPosition.value.left, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX)),
        top: Math.max(VIEWPORT_MARGIN_PX, Math.min(menuPosition.value.top, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX)),
    }
    void focusIntoMenu()
}
</script>

<template>
    <div ref="container" class="cn-dropdown">
        <button
            ref="triggerEl"
            type="button"
            class="cn-dropdown__trigger"
            data-dropdown-trigger
            aria-haspopup="menu"
            :aria-expanded="open"
            :title="title ?? label"
            @click="onToggle()"
            @keydown.down.prevent="onTriggerArrowDown()"
        >
            {{ label }}
            <span class="cn-dropdown__caret" aria-hidden="true">▾</span>
        </button>
        <div
            v-if="open"
            ref="menuEl"
            class="cn-dropdown__menu"
            role="menu"
            :aria-label="label"
            data-dropdown-menu
            tabindex="-1"
            :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
            @keydown.stop="onMenuKeydown($event)"
        >
            <template v-for="(entry, index) in items" :key="index">
                <div
                    v-if="entry === 'separator'"
                    class="cn-dropdown__separator"
                    role="separator"
                    data-dropdown-separator
                    aria-hidden="true"
                ></div>
                <button
                    v-else
                    type="button"
                    role="menuitem"
                    class="cn-dropdown__item"
                    data-dropdown-item
                    tabindex="-1"
                    :disabled="entry.disabled"
                    :title="entry.title"
                    @click="run(entry)"
                >
                    <span class="cn-dropdown__item-label">{{ entry.label }}</span>
                    <span v-if="entry.shortcut" class="cn-dropdown__shortcut">{{ entry.shortcut }}</span>
                </button>
            </template>
        </div>
    </div>
</template>

<style scoped>
/* 自带主题，不依赖宿主接线也不渗漏：菜单壳五令牌与 panel-theme.css 同值；
   触发钮 ghost 形态两令牌（--cn-fg-2/--cn-hover）沿壳层暗色族（App.vue
   .toolbar button / FindBar 自带块同值） */
.cn-dropdown {
    --cn-fg: #e6edf7;
    --cn-fg-2: #c3cddd;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-bg-elevated: #101a2e;
    --cn-hover: #16223a;
    --cn-accent: #38bdf8;
    --cn-accent-soft: rgba(56, 189, 248, 0.12);

    position: relative;
    display: inline-flex;
}

/* 触发钮 ghost 形态：沿 playground 工具栏钮观感（App.vue .toolbar button） */
.cn-dropdown__trigger {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 5px 9px;
    border: none;
    border-radius: 6px;
    background: transparent;
    font-size: 13px;
    white-space: nowrap;
    color: var(--cn-fg-2);
    cursor: pointer;
}

.cn-dropdown__trigger:hover {
    background: var(--cn-hover);
    color: var(--cn-fg);
}

.cn-dropdown__caret {
    font-size: 10px;
    line-height: 1;
    color: var(--cn-muted);
}

/* 菜单壳：暗色抬升面（状态栏缩放菜单/右键菜单同观感），向下弹出。fixed +
   内联视口坐标（见组件头注「fixed 弹层定位」）——left/top 由打开时计算，CSS
   不再持有相对偏移 */
.cn-dropdown__menu {
    position: fixed;
    z-index: 40;
    min-width: 148px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
}

.cn-dropdown__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    padding: 6px 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--cn-fg);
    font-size: 12px;
    line-height: 1.4;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}

.cn-dropdown__item:hover:not(:disabled) {
    background: var(--cn-accent-soft);
    color: var(--cn-accent);
}

.cn-dropdown__item:disabled {
    color: var(--cn-muted);
    cursor: not-allowed;
}

/* 键位后缀：纯展示灰字（字符串由调用方传入，底座不做平台检测） */
.cn-dropdown__shortcut {
    flex: none;
    font-size: 11px;
    line-height: 1.4;
    color: var(--cn-muted);
    font-variant-numeric: tabular-nums;
}

/* 分组分隔线（'separator' 条目） */
.cn-dropdown__separator {
    flex: none;
    height: 1px;
    margin: 3px 6px;
    background: var(--cn-line);
}
</style>
