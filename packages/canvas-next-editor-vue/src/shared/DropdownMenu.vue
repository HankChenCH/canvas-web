<script setup lang="ts">
/**
 * DropdownMenu：轻量下拉菜单底座（editor-top-toolbar 工单 02）——触发钮 + 弹层
 * 菜单一体的呈现件，供工具栏三下拉（＋插入▾/排列▾/视图▾，issues/03）使用。
 *
 * - 开合与收起逻辑在 useDropdownMenu（另有单测）：触发钮点击开合；开时点外收
 *   （容器包含判定）、Esc 收（window keydown，开态才挂监听）；
 * - a11y 对齐状态栏缩放菜单既有先例（StatusBar.vue）：触发钮 aria-haspopup=
 *   "menu" + :aria-expanded，菜单 role="menu" + 项 role="menuitem"；
 * - 菜单项契约见 DropdownMenuItem：shortcut 为纯展示键位后缀（右侧灰字，平台
 *   文案由调用方传入）；title 承载置灰原因（「置灰 + title」统一先例
 *   ContextMenu.vue）；'separator' 条目渲染分段分隔线（排列▾/视图▾ 各需一段）；
 * - 分发即收（选中动作后菜单收）；keepsOpen 语义本期不做（spec Q12）。
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

import { useDropdownMenu, type DropdownMenuEntry, type DropdownMenuItem } from './useDropdownMenu'

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

/** 分发即收（ContextMenu 动作即关同款；keepsOpen 本期不做） */
function run(item: DropdownMenuItem): void {
    item.run()
    closeMenu()
}

/** 点击开合 + 打开时定位：同步取触发钮 rect 落首帧坐标，渲染后按实际尺寸钳位 */
async function onToggle(): Promise<void> {
    if (!open.value) {
        const rect = triggerEl.value?.getBoundingClientRect()
        if (rect) menuPosition.value = { left: rect.left, top: rect.bottom + MENU_GAP_PX }
    }
    toggle()
    if (!open.value) return
    await nextTick()
    const rect = menuEl.value?.getBoundingClientRect()
    if (!rect) return
    menuPosition.value = {
        left: Math.max(VIEWPORT_MARGIN_PX, Math.min(menuPosition.value.left, window.innerWidth - rect.width - VIEWPORT_MARGIN_PX)),
        top: Math.max(VIEWPORT_MARGIN_PX, Math.min(menuPosition.value.top, window.innerHeight - rect.height - VIEWPORT_MARGIN_PX)),
    }
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
            :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }"
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
