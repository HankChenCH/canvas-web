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
 *
 * 样式自带令牌（与 panel-theme.css 同值）：触发钮 ghost 形态沿 playground
 * 工具栏钮观感（App.vue .toolbar button），菜单壳沿状态栏缩放菜单/右键菜单
 * （暗色抬升面 + accent 悬停）；自带主题不依赖宿主接线，也不渗漏。向下弹出
 * （工具栏下拉自顶栏向下开）。data-dropdown-* 钩子供目验定位（issues/03）。
 */
import { ref } from 'vue'

import { useDropdownMenu, type DropdownMenuEntry, type DropdownMenuItem } from './useDropdownMenu'

const props = defineProps<{
    /** 触发钮文案（▾ 收合指示组件自带）+ 菜单 aria-label */
    label: string
    items: readonly DropdownMenuEntry[]
    /** 触发钮悬停说明；缺省回落 label */
    title?: string
}>()

const container = ref<HTMLElement | null>(null)
const { open, toggle, closeMenu } = useDropdownMenu({ container })

/** 分发即收（ContextMenu 动作即关同款；keepsOpen 本期不做） */
function run(item: DropdownMenuItem): void {
    item.run()
    closeMenu()
}
</script>

<template>
    <div ref="container" class="cn-dropdown">
        <button
            type="button"
            class="cn-dropdown__trigger"
            data-dropdown-trigger
            aria-haspopup="menu"
            :aria-expanded="open"
            :title="title ?? label"
            @click="toggle()"
        >
            {{ label }}
            <span class="cn-dropdown__caret" aria-hidden="true">▾</span>
        </button>
        <div v-if="open" class="cn-dropdown__menu" role="menu" :aria-label="label" data-dropdown-menu>
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
/* 令牌与 panel-theme.css 同值：底座自带主题（ghost 钮 + 暗色壳），不依赖宿主
   接线，也不渗漏 */
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

/* 菜单壳：暗色抬升面（状态栏缩放菜单/右键菜单同观感），向下弹出 */
.cn-dropdown__menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
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
