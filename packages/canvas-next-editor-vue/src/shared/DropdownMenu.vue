<script setup lang="ts">
/**
 * DropdownMenu：轻量下拉菜单底座（editor-top-toolbar 工单 02）——触发钮 + 弹层
 * 菜单一体的呈现件。两类消费面：
 * - 工具栏三下拉（＋插入▾/排列▾/视图▾，issues/03）：内建 ghost 触发钮 +
 *   向下弹层，items 传参即用；
 * - 旧菜单迁移（issues/05，状态栏缩放菜单 + 面板＋）：#trigger 受控插槽自绘
 *   触发钮（状态栏 % 读数段、面板＋方钮——a11y 两属性由消费方写在自绘钮上），
 *   direction="up" 向上弹层（状态栏贴视口底缘），#body 受控插槽承载菜单体附加
 *   内容（面板＋ rowsPath 表单——keepsOpen 项交换 items 后表单留场，创建/取消
 *   经 closeMenu 自管收起），closed 事件供消费方做随收清理（表单态重置）。
 *
 * - 开合与收起逻辑在 useDropdownMenu（另有单测）：触发钮点击开合；开时点外收
 *   （容器包含判定）、Esc 收（window keydown，开态才挂监听）；
 * - a11y 对齐状态栏缩放菜单先例（StatusBar.vue）：触发钮 aria-haspopup=
 *   "menu" + :aria-expanded，菜单 role="menu" + 项 role="menuitem"；
 * - 菜单项契约见 DropdownMenuItem：shortcut 为纯展示键位后缀（右侧灰字，平台
 *   文案由调用方传入）；title 承载置灰原因（「置灰 + title」统一先例
 *   ContextMenu.vue）；'separator' 条目渲染分段分隔线；dataAttrs 透传 data-*
 *   目验钩子；分发即收（keepsOpen 项例外）+ 回焦触发钮（APG menu button 惯例）。
 * - 键盘导航（issues/04）：开时焦点入菜单（首个启用项，全置灰兜底落菜单根
 *   tabindex=-1）；菜单内 ↑↓ 循环移动、Home/End 首尾，**跳过置灰项**（原生
 *   disabled 不可聚焦，拍板记 issues/04 Comments）；Enter/Space 显式激活
 *   （preventDefault 抑制原生 click——Space 的 keyup click / Enter 的 keydown
 *   click——防双跑，且路径可被 jsdom 钉住）；Esc/Tab 收起并先把焦点送回触发钮
 *   （幸免菜单卸载焦点坠 body；点外收路径不在此列——焦点归用户点击落点），
 *   Tab 不 preventDefault，浏览器原生 Tab 随即自触发钮继续移焦（触发钮非
 *   Tab 终态，APG 同例）；body 插槽表单内的可编辑目标（输入框/按钮）Tab 让路
 *   不收菜单——原生移焦走表单序（面板＋表单既有 Tab 流，issues/05）。
 *   菜单根 @keydown.stop：焦点在菜单内时按键不再到 window——画布手势/微调不
 *   感知（与 useShortcuts 让路规则双保险：焦点在钮上分类器本就 yield）；
 *   typeahead 不做（issues/04 拍板可选）。触发钮 ↓ 开菜单（Enter/Space 走
 *   原生钮激活语义经 click 开合，底座不另拦）。body 插槽里的可编辑目标
 *   （表单输入框）方向键归原生编辑不劫持（isEditableEventTarget 守卫，菜单项
 *   本体是 button 按 data-dropdown-item 排除）。
 * - 弹层 fixed 定位（issues/03 集成）：宿主工具栏是 overflow-x:auto 内滚容器，
 *   absolute 弹层会被其裁切——fixed 后代不受 overflow 祖先影响（壳内无
 *   transform/filter 祖先，无 containing block 例外）。打开时按触发钮 rect 取
 *   首帧锚点（down = top 锚「下缘 + 间隙」、up = bottom 锚「视口高 − 上缘 +
 *   间隙」，两式都免测高），渲染后按实际尺寸钳位进视口（右缘的视图▾ 必须收回，
 *   ContextMenu openAt 同款：换算只在打开时发生一次，pan/resize 不跟随——瞬时
 *   弹层可接受）。**宿主前提（issues/05 目验实录）**：触发钮祖先链不得有
 *   transform/filter/backdrop-filter——都会劫持 fixed 包含块，弹层按视口坐标
 *   写入却相对该祖先定位（错位）且重新落进 overflow 裁切（图层面板 sticky
 *   header 的 backdrop-blur-sm 即此事故，已摘除；bg 95% 不透明 blur 本不可见）。
 *
 * 样式自带令牌（与 panel-theme.css 同值）：触发钮 ghost 形态沿 playground
 * 工具栏钮观感（App.vue .toolbar button），菜单壳沿状态栏缩放菜单/右键菜单
 * （暗色抬升面 + accent 悬停）；自带主题不依赖宿主接线，也不渗漏。data-dropdown-*
 * 钩子供目验定位（issues/03）。
 */
import { nextTick, ref, watch, type ComponentPublicInstance } from 'vue'

import { isEditableEventTarget } from './editableTarget'
import {
    nextEnabledItemIndex,
    useDropdownMenu,
    type DropdownMenuEntry,
    type DropdownMenuItem,
    type DropdownMenuSlotProps,
    type MenuFocusKey,
} from './useDropdownMenu'

const props = withDefaults(
    defineProps<{
        /** 触发钮文案（▾ 收合指示组件自带）+ 菜单 aria-label */
        label: string
        items: readonly DropdownMenuEntry[]
        /** 触发钮悬停说明；缺省回落 label */
        title?: string
        /** 弹层方向：down = 触发钮下缘向下（工具栏缺省）；up = 上缘向上（状态栏贴视口底缘） */
        direction?: 'up' | 'down'
    }>(),
    { direction: 'down' },
)

/** 菜单收起事件（开→收即发，收起三路 + 分发都覆盖）：消费方随收清理用
 *  （面板＋ rowsPath 表单态重置，issues/05） */
const emit = defineEmits<{ closed: [] }>()

defineSlots<{
    /** 自定义触发钮（受控 props 见 DropdownMenuSlotProps）；缺省渲染内建 ghost 钮 */
    trigger?(slotProps: DropdownMenuSlotProps): unknown
    /** 菜单体附加内容（渲染在菜单项之后）：容器包含判定覆盖——内含点击不收 */
    body?(slotProps: DropdownMenuSlotProps): unknown
}>()

/** 弹层与触发钮的屏幕间隙（原 CSS top: calc(100% + 6px) 的 6px） */
const MENU_GAP_PX = 6
/** 视口钳位的屏幕边距（ContextMenu openAt 同值） */
const VIEWPORT_MARGIN_PX = 2

const container = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const { open, toggle, closeMenu } = useDropdownMenu({ container })

/** 菜单收起（开→收即发，收起三路 + 分发覆盖）随收清理钩子 */
watch(open, (isOpen) => {
    if (!isOpen) emit('closed')
})

/** 弹层视口坐标（fixed 内联 style，开态首帧即落位）：down = top 锚（触发钮下缘
 *  + 间隙，免测高），up = bottom 锚（视口高 − 触发钮上缘 + 间隙，同理免测高）；
 *  渲染后按实际尺寸钳位进视口（两方向同式） */
const menuPosition = ref<{ left: number; edge: 'top' | 'bottom'; offset: number }>({ left: 0, edge: 'top', offset: 0 })

/** 收起回焦触发钮：点外收（composable window 监听路径）不回焦——焦点归用户
 *  点击落点；其余组件内发起的收起（激活/Esc/Tab/触发钮点收）都回焦 */
function focusTrigger(): void {
    triggerEl.value?.focus()
}

/** 触发钮元素记录（函数 ref）：内建钮与 #trigger 自绘钮同缝——自绘钮消费方
 *  :ref 接线，缺它则定位与回焦退化（弹层落 0,0 钳位、收起不回焦） */
function setTriggerRef(el: Element | ComponentPublicInstance | null): void {
    triggerEl.value = el instanceof HTMLElement ? el : null
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

/** 分发（ContextMenu 动作即关同款）+ 回焦触发钮；keepsOpen 项例外——执行后
 *  菜单留场（面板＋模板表表单交换特例，issues/05），留场焦点随项卸载落菜单体 */
function run(item: DropdownMenuItem): void {
    item.run()
    if (item.keepsOpen === true) return
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
 *  click）防双跑；方向键先让路可编辑目标（body 插槽表单输入框——原生光标移动
 *  不劫持；菜单项本体是 button 会被 isEditableEventTarget 命中，按
 *  data-dropdown-item 排除） */
function onMenuKeydown(event: KeyboardEvent): void {
    const key = event.key
    if (key === 'Escape' || key === 'Tab') {
        // Tab 让路可编辑目标（body 表单内的输入框/按钮——原生移焦走表单序：
        // input→创建→取消，菜单不收；面板＋表单既有 Tab 流，issues/05 review 补）
        if (key === 'Tab') {
            const tabTarget = event.target
            if (tabTarget instanceof HTMLElement && !tabTarget.matches('[data-dropdown-item]') && isEditableEventTarget(tabTarget)) return
        }
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
        const target = event.target
        if (target instanceof HTMLElement && !target.matches('[data-dropdown-item]') && isEditableEventTarget(target)) return
        event.preventDefault()
        moveMenuFocus(key)
    }
    // 其余按键吞掉（.stop 已阻断到 window）：焦点态菜单的模态键盘语义
}

/** 触发钮按键路由（内建钮与 #trigger 自绘钮共用）：↓ 开菜单（键盘开菜单入口），
 *  已开（指针开菜单后焦点仍在触发钮的环境）直接把焦点送入菜单；Enter/Space 走
 *  原生钮激活语义经 click 开合，不另拦 */
function onTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown') return
    event.preventDefault()
    if (!open.value) {
        void onToggle()
        return
    }
    void focusIntoMenu()
}

/** 点击开合 + 打开时定位：同步取触发钮 rect 落首帧锚点（down = top 锚 / up =
 *  bottom 锚，均免测高），渲染后按实际尺寸钳位；开时焦点入菜单，收起回焦触发钮 */
async function onToggle(): Promise<void> {
    if (!open.value) {
        const rect = triggerEl.value?.getBoundingClientRect()
        if (rect) {
            menuPosition.value =
                props.direction === 'up'
                    ? { left: rect.left, edge: 'bottom', offset: window.innerHeight - rect.top + MENU_GAP_PX }
                    : { left: rect.left, edge: 'top', offset: rect.bottom + MENU_GAP_PX }
        }
    }
    toggle()
    if (!open.value) {
        focusTrigger()
        return
    }
    await nextTick()
    const rect = menuEl.value?.getBoundingClientRect()
    if (!rect) return
    const current = menuPosition.value
    menuPosition.value = {
        left: Math.max(VIEWPORT_MARGIN_PX, Math.min(current.left, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX)),
        edge: current.edge,
        offset: Math.max(VIEWPORT_MARGIN_PX, Math.min(current.offset, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX)),
    }
    void focusIntoMenu()
}
</script>

<template>
    <div ref="container" class="cn-dropdown">
        <!-- 触发钮：缺省内建 ghost 钮；#trigger 受控插槽自绘（状态栏 % 读数段 /
             面板＋方钮，issues/05）——a11y 两属性由消费方写在自绘钮上 -->
        <slot
            name="trigger"
            :open="open"
            :toggle="onToggle"
            :close-menu="closeMenu"
            :trigger-ref="setTriggerRef"
            :on-keydown="onTriggerKeydown"
        >
            <button
                :ref="setTriggerRef"
                type="button"
                class="cn-dropdown__trigger"
                data-dropdown-trigger
                aria-haspopup="menu"
                :aria-expanded="open"
                :title="title ?? label"
                @click="onToggle()"
                @keydown="onTriggerKeydown"
            >
                {{ label }}
                <span class="cn-dropdown__caret" aria-hidden="true">▾</span>
            </button>
        </slot>
        <div
            v-if="open"
            ref="menuEl"
            class="cn-dropdown__menu"
            role="menu"
            :aria-label="label"
            data-dropdown-menu
            tabindex="-1"
            :style="
                menuPosition.edge === 'top'
                    ? { left: `${menuPosition.left}px`, top: `${menuPosition.offset}px` }
                    : { left: `${menuPosition.left}px`, bottom: `${menuPosition.offset}px` }
            "
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
                    v-bind="entry.dataAttrs"
                    @click="run(entry)"
                >
                    <span class="cn-dropdown__item-label">{{ entry.label }}</span>
                    <span v-if="entry.shortcut" class="cn-dropdown__shortcut">{{ entry.shortcut }}</span>
                </button>
            </template>
            <!-- 菜单体附加内容（面板＋ rowsPath 表单特例）：在容器包含判定内，
                 内含点击不收；收起经 closeMenu 自管 -->
            <slot
                name="body"
                :open="open"
                :toggle="onToggle"
                :close-menu="closeMenu"
                :trigger-ref="setTriggerRef"
                :on-keydown="onTriggerKeydown"
            />
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

/* 菜单壳：暗色抬升面（状态栏缩放菜单/右键菜单同观感）。fixed + 内联视口坐标
   （见组件头注「fixed 弹层定位」）——left 与 top/bottom 之一（随 direction）由
   打开时计算，CSS 不再持有相对偏移 */
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
