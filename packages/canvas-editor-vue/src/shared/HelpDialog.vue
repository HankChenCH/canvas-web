<script setup lang="ts">
/**
 * HelpDialog：快捷键帮助面板（kbd-nav 工单 04，shared 域）。
 *
 * - 开合态来自 useShortcutsHelp() 单例（⌘/ 与状态栏「快捷键」按钮双入口共享），
 *   组件自身不持状态；宿主挂载一次即接通两个入口；
 * - Teleport body + fixed 居中模态：遮罩点击 / Escape / ✕ 三路关闭（Escape 的
 *   window 监听随开合挂卸——Escape 不在注册表键位之列，无冲突）；
 * - 自带令牌块：Teleport 后脱离宿主 DOM 子树，--cn-* 同值自带（ContextMenu/
 *   ExpressionCompletionPopup 先例），不依赖宿主接线也不渗漏；
 * - 内容两组：① 注册表动作——bindings 注入缝缺省 DEFAULT_EDITOR_SHORTCUTS
 *   （注册表是键位唯一事实源，后续新动作自动入面板），按 group 分节、展示名归
 *   本包（shortcutsHelp）；键位符号按平台渲染（platform 注入缝缺省侦测）；
 *   ② 内置交互静态清单——画布表面的手势语义（滚轮缩放/空格平移/画拉建层流程/
 *   双击编辑/Escape/方向键微调/Tab 循环），不在注册表键位之列，静态文案随组件。
 */
import { computed, onBeforeUnmount, watch } from 'vue'

import {
    DEFAULT_EDITOR_SHORTCUTS,
    type EditorShortcutBinding,
} from '@hankchen/canvas-editor'

import { useShortcutsHelp } from './useShortcutsHelp'
import {
    SHORTCUT_GROUP_LABELS,
    SHORTCUT_GROUP_ORDER,
    detectShortcutPlatform,
    shortcutKeyLabel,
    type ShortcutPlatform,
} from './shortcutsHelp'

const props = withDefaults(
    defineProps<{
        /** 注册表注入缝：缺省内核缺省集；宿主扩展键位后传定制集即自动入面板 */
        bindings?: readonly EditorShortcutBinding[]
        /** 平台注入缝（键位符号形态）；缺省按 navigator 侦测 */
        platform?: ShortcutPlatform
    }>(),
    // 数组型 prop 的缺省按 Vue 规范走工厂（共享 readonly 注册表不做深拷贝）
    { bindings: () => DEFAULT_EDITOR_SHORTCUTS },
)

const { open, close } = useShortcutsHelp()

const platform = computed<ShortcutPlatform>(() => props.platform ?? detectShortcutPlatform())

/** 注册表按 group 分节（空节不渲染；节内条目序 = 注册表声明序） */
const sections = computed(() =>
    SHORTCUT_GROUP_ORDER.map((group) => ({
        group,
        label: SHORTCUT_GROUP_LABELS[group],
        bindings: props.bindings.filter((binding) => binding.group === group),
    })).filter((section) => section.bindings.length > 0),
)

/** 内置交互静态清单（画布手势文案；不入注册表的导航/编辑面） */
const interactions = [
    { gesture: 'Ctrl/⌘ + 滚轮', text: '缩放画布（以指针为中心，5%–800%）' },
    { gesture: '空格拖动', text: '平移画布（中键拖拽、左键拖空白同效）' },
    {
        gesture: '面板菜单 / T·G·Q·I',
        text: '画拉建层：点层型或按键武装 → 画布拖拽定落位与尺寸（位移小于死区 = 点击兜底缺省尺寸）→ 自动选中、文本直打；Esc 取消',
    },
    { gesture: '双击', text: '就地编辑文本' },
    { gesture: 'Esc', text: '退出编辑 / 解除武装 / 关闭弹层 / 选择逐级升级（格→行→表）' },
    { gesture: '方向键', text: '微调选中图层 1px（按住 Shift 大步 10px）' },
    { gesture: 'Tab / ⇧Tab', text: '在根图层间循环选层（跳过隐藏与锁定）' },
]

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close()
}

watch(open, (isOpen) => {
    if (isOpen) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
    <Teleport to="body">
        <div v-if="open" class="cn-help" data-help-overlay @pointerdown.self="close">
            <div class="cn-help__panel" role="dialog" aria-modal="true" aria-label="快捷键帮助" data-help-dialog>
                <header class="cn-help__header">
                    <h2 class="cn-help__title">快捷键</h2>
                    <button type="button" class="cn-help__close" data-help-close aria-label="关闭快捷键帮助" @click="close">
                        ✕
                    </button>
                </header>
                <div class="cn-help__body">
                    <section
                        v-for="section in sections"
                        :key="section.group"
                        class="cn-help__section"
                        :data-help-group="section.group"
                    >
                        <h3 class="cn-help__section-title">{{ section.label }}</h3>
                        <ul class="cn-help__list">
                            <li
                                v-for="binding in section.bindings"
                                :key="`${binding.action}:${binding.combo.key}`"
                                class="cn-help__row"
                                data-help-shortcut
                            >
                                <span class="cn-help__label">{{ binding.label }}</span>
                                <kbd class="cn-help__keys">{{ shortcutKeyLabel(binding.combo, platform) }}</kbd>
                            </li>
                        </ul>
                    </section>
                    <section class="cn-help__section" data-help-interactions>
                        <h3 class="cn-help__section-title">内置交互</h3>
                        <ul class="cn-help__list">
                            <li v-for="row in interactions" :key="row.gesture" class="cn-help__row" data-help-interaction>
                                <span class="cn-help__label">{{ row.text }}</span>
                                <kbd class="cn-help__keys">{{ row.gesture }}</kbd>
                            </li>
                        </ul>
                    </section>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/* 令牌与 panel-theme.css 同值：面板自带主题（暗色检视面），不依赖宿主接线 */
.cn-help {
    --cn-bg: #0b1220;
    --cn-bg-elevated: #101a2e;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-accent: #38bdf8;

    position: fixed;
    inset: 0;
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: rgba(2, 6, 23, 0.55);
}

.cn-help__panel {
    display: flex;
    flex-direction: column;
    max-height: 100%;
    min-width: 320px;
    max-width: 480px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(2, 6, 23, 0.6);
}

.cn-help__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--cn-line);
}

.cn-help__title {
    margin: 0;
    color: var(--cn-fg);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
}

.cn-help__close {
    padding: 2px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--cn-muted);
    font-size: 13px;
    line-height: 1.4;
    cursor: pointer;
}

.cn-help__close:hover {
    background: rgba(148, 163, 184, 0.07);
    color: var(--cn-fg);
}

.cn-help__body {
    overflow-y: auto;
    padding: 8px 16px 16px;
}

.cn-help__section {
    margin-top: 12px;
}

.cn-help__section:first-child {
    margin-top: 8px;
}

.cn-help__section-title {
    margin: 0 0 4px;
    color: var(--cn-accent);
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
}

.cn-help__list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.cn-help__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 3px 0;
}

.cn-help__label {
    color: var(--cn-fg);
    font-size: 12px;
    line-height: 1.5;
}

.cn-help__keys {
    flex-shrink: 0;
    padding: 1px 6px;
    border: 1px solid var(--cn-line);
    border-radius: 5px;
    background: rgba(148, 163, 184, 0.07);
    color: var(--cn-muted);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    line-height: 1.4;
    white-space: nowrap;
}
</style>
