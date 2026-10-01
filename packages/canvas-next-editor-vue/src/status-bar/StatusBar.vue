<script setup lang="ts">
/**
 * StatusBar：状态栏（工单 14；playground-canvas-first 工单 01 收编全部读数）。
 *
 * 既有段：
 * - 缩放百分比：ui.viewport 分支通知驱动（useViewport 切片桥）——kbd-nav 工单 04
 *   起只读 % 段升级为交互控件：点击弹出五项菜单（100% 复位/适应画布/适应选区/
 *   放大/缩小，步进 = zoomAt 视口中心 ×/÷1.25 的 playground 浮条先例收编；不做
 *   数值输入框），分发即收、点外/Esc 收；data-zoom-* 目验钩子沿浮条命名迁入；
 * - 选中图层路径：ui.selection 分支驱动（useSelection）+ formatLayerPath；
 * - 物化进行数：宿主注入 prop（Materializer 住 browser-renderer，红线禁止
 *   editor-vue 直连——宿主订阅物化状态后在途计数传入），0 时该段隐藏；
 * - 坐标尺寸段：组件内部由文档 position（resolveLayer）+ layerBoxAt 解析盒
 *   计算 `x=… y=… · 宽×高 · 锚点 …`，选择变更与拖动文档事务实时联动
 *   （useDoc/useSelection 双桥驱动），未选中隐藏；
 * - 资源状态段：宿主注入文案 prop（资源就绪/物化中/失败 N 项），沿用
 *   pendingCount 注入模式，缺省隐藏；
 * - 保存态段：宿主注入 saveState prop（● 未保存 / ○ 已保存），未接线隐藏；
 * - schema 声明态段：组件直读 ui 分支（已注入顶层 N 键 / 无候选），恒显；
 * - 瞬时反馈段：宿主注入动作结果/错误文案 prop + 包内瞬时反馈单例
 *   （useTransientFeedback，kbd-nav 工单 05——canvas 域拖放被忽略的降级提示等
 *   包内来源），宿主文案优先、包内瞬时补位，缺省隐藏。
 *
 * kbd-nav 工单 04 新增「快捷键」段按钮：useShortcutsHelp 单例开合（帮助面板
 * 第二入口，⌘/ 走 useShortcuts 桥同态；HelpDialog 由宿主挂载渲染）。
 *
 * 路径格式化 formatLayerPath（纯函数另有单测）/ 坐标格式化 formatLayerGeometry
 * （经本组件 mount 测试覆盖格式与取整）。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'

import type { EditorSession } from '@hankchen/canvas-next-editor'
import { resolveLayer } from '@hankchen/canvas-next-editor'

import { formatLayerPath } from './layerPathLabel'
import { formatLayerGeometry } from './layerGeometryLabel'
import { useDataSourceSchema } from './useDataSourceSchema'
import { useDoc } from './useDoc'
import { detectShortcutPlatform, shortcutActionLabel } from '../shared/shortcutsHelp'
import { useSelection } from '../shared/useSelection'
import { useShortcutsHelp } from '../shared/useShortcutsHelp'
import { useTransientFeedback } from '../shared/useTransientFeedback'
import { useViewport } from '../shared/useViewport'

const props = withDefaults(
    defineProps<{
        editor: EditorSession
        pendingCount?: number
        /** 宿主注入的资源状态文案（资源就绪/物化中 N/失败 N 项）；空串隐藏 */
        resourceNote?: string
        /** 宿主注入的保存态；未接线（undefined）隐藏 */
        saveState?: 'dirty' | 'clean'
        /** 宿主注入的瞬时反馈文案（保存/打开/导出/上传/schema 动作结果与错误）；空串隐藏 */
        feedback?: string
    }>(),
    {
        pendingCount: 0,
        resourceNote: '',
        feedback: '',
    },
)

const viewport = useViewport(props.editor)
const selection = useSelection(props.editor)
const doc = useDoc(props.editor)
const dataSourceSchema = useDataSourceSchema(props.editor)

const zoomPercent = computed(() => Math.round(viewport.value.zoom * 100))
const selectionLabel = computed(() => {
    const path = selection.value
    return path === null ? '未选中图层' : formatLayerPath(path)
})

/** 坐标尺寸段：文档 position + 解析盒；未选中/解析不到/无盒隐藏 */
const geometryLabel = computed(() => {
    const path = selection.value
    const current = doc.value
    if (path === null || current === null) return null
    const layer = resolveLayer(current, path)
    const box = props.editor.layerBoxAt(path)
    if (!layer || !box) return null
    return formatLayerGeometry(layer.position, box)
})

/** schema 声明态段：组件直读 ui 分支（经切片桥响应式，声明随会话，openDocument 不重置） */
const schemaLabel = computed(() => {
    const schema = dataSourceSchema.value
    return schema === null ? 'schema 无候选' : `schema 已注入顶层 ${schema.properties?.size ?? 0} 键`
})

// ---- 缩放控件（kbd-nav 工单 04）：只读 % 段升级弹层菜单 ----

const zoomMenuOpen = ref(false)

/** 帮助面板单例开合（「快捷键」段按钮；⌘/ 走 useShortcuts 桥共享同一 open 态） */
const { toggle: toggleHelp } = useShortcutsHelp()

/** 键位提示按宿主平台渲染两形态（⌘/ 或 Ctrl+/）：直查注册表，文案不另抄键位；
 *  平台不会话中变更，挂载时求值一次 */
const helpTitle = `快捷键帮助（${shortcutActionLabel('helpShortcuts', detectShortcutPlatform())}）`

/** 包内瞬时反馈单例（kbd-nav 工单 05）：canvas 域拖放降级等直写，这里补位显示 */
const transient = useTransientFeedback()

/** 反馈段读数：宿主注入文案优先（宿主动作语义、长驻），否则包内瞬时反馈补位 */
const feedbackText = computed(() => (props.feedback !== '' ? props.feedback : transient.message.value))

/** 缩放步进（playground 浮条先例收编）：以视口中心为锚 ×/÷ 因子，平移不跳变 */
function zoomBy(factor: number): void {
    const { width, height } = props.editor.getSurfaceSize()
    props.editor.zoomAt(width / 2, height / 2, viewport.value.zoom * factor)
}

/** 弹层菜单分发：执行即收（ContextMenu 动作即关同款） */
function runZoom(run: () => void): void {
    run()
    zoomMenuOpen.value = false
}

// 开启期间点外/Esc 收菜单：监听随开合挂卸；触发钮 pointerdown.stop 免二次翻转
// （pointerdown 先于 click——不拦则点触发钮收了又被 click 重开）
function onWindowPointerDown(): void {
    zoomMenuOpen.value = false
}

function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') zoomMenuOpen.value = false
}

watch(zoomMenuOpen, (isOpen) => {
    if (isOpen) {
        window.addEventListener('pointerdown', onWindowPointerDown)
        window.addEventListener('keydown', onWindowKeydown)
    } else {
        window.removeEventListener('pointerdown', onWindowPointerDown)
        window.removeEventListener('keydown', onWindowKeydown)
    }
})
onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onWindowPointerDown)
    window.removeEventListener('keydown', onWindowKeydown)
})
</script>

<template>
    <footer class="cn-statusbar" role="status" aria-label="编辑器状态栏">
        <div class="cn-statusbar__zoom">
            <button
                type="button"
                class="cn-statusbar__segment cn-statusbar__zoom-trigger"
                data-zoom
                aria-haspopup="menu"
                :aria-expanded="zoomMenuOpen"
                title="缩放"
                @pointerdown.stop
                @click="zoomMenuOpen = !zoomMenuOpen"
            >
                {{ zoomPercent }}%
            </button>
            <div v-if="zoomMenuOpen" class="cn-statusbar__zoom-menu" role="menu" aria-label="缩放" data-zoom-menu @pointerdown.stop>
                <button type="button" role="menuitem" class="cn-statusbar__zoom-item" data-zoom-100 @click="runZoom(() => props.editor.resetZoom())">
                    100%
                </button>
                <button type="button" role="menuitem" class="cn-statusbar__zoom-item" data-zoom-fit @click="runZoom(() => props.editor.fitToSurface())">
                    适应画布
                </button>
                <button type="button" role="menuitem" class="cn-statusbar__zoom-item" data-zoom-fit-selection @click="runZoom(() => props.editor.fitToSelection())">
                    适应选区
                </button>
                <button type="button" role="menuitem" class="cn-statusbar__zoom-item" data-zoom-in title="放大（以视口中心为锚）" @click="runZoom(() => zoomBy(1.25))">
                    放大
                </button>
                <button type="button" role="menuitem" class="cn-statusbar__zoom-item" data-zoom-out title="缩小（以视口中心为锚）" @click="runZoom(() => zoomBy(1 / 1.25))">
                    缩小
                </button>
            </div>
        </div>
        <span class="cn-statusbar__divider" aria-hidden="true"></span>
        <span class="cn-statusbar__segment" data-selection>{{ selectionLabel }}</span>
        <template v-if="props.pendingCount > 0">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment cn-statusbar__segment--pending" data-pending>
                物化中 {{ props.pendingCount }}
            </span>
        </template>
        <template v-if="geometryLabel !== null">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-geometry>{{ geometryLabel }}</span>
        </template>
        <template v-if="props.resourceNote !== ''">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-resource>{{ props.resourceNote }}</span>
        </template>
        <template v-if="props.saveState !== undefined">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-save>
                {{ props.saveState === 'dirty' ? '● 未保存' : '○ 已保存' }}
            </span>
        </template>
        <span class="cn-statusbar__divider" aria-hidden="true"></span>
        <span class="cn-statusbar__segment" data-schema>{{ schemaLabel }}</span>
        <template v-if="feedbackText !== ''">
            <span class="cn-statusbar__divider" aria-hidden="true"></span>
            <span class="cn-statusbar__segment" data-feedback>{{ feedbackText }}</span>
        </template>
        <span class="cn-statusbar__divider" aria-hidden="true"></span>
        <button
            type="button"
            class="cn-statusbar__segment cn-statusbar__help"
            data-help
            aria-haspopup="dialog"
            :title="helpTitle"
            @click="toggleHelp"
        >
            快捷键
        </button>
    </footer>
</template>

<style scoped>
/* 令牌与 panel-theme.css 同值：状态栏自带主题，不依赖宿主接线，也不渗漏 */
.cn-statusbar {
    --cn-bg: #0b1220;
    --cn-bg-elevated: #101a2e;
    --cn-fg: #e6edf7;
    --cn-muted: #7c8ca5;
    --cn-line: #1e2a40;
    --cn-accent: #38bdf8;

    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 12px;
    background-color: var(--cn-bg);
    color: var(--cn-muted);
    font-size: 12px;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
    user-select: none;
}

.cn-statusbar__segment {
    white-space: nowrap;
}

/* 缩放控件（kbd-nav 工单 04）：触发钮沿用读数观感，弹层菜单向上弹出 */
.cn-statusbar__zoom {
    position: relative;
}

.cn-statusbar__zoom-trigger {
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
}

.cn-statusbar__zoom-trigger:hover {
    color: var(--cn-accent);
}

.cn-statusbar__zoom-menu {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 40;
    min-width: 108px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 4px;
    background: var(--cn-bg-elevated);
    border: 1px solid var(--cn-line);
    border-radius: 10px;
    box-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
}

.cn-statusbar__zoom-item {
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

.cn-statusbar__zoom-item:hover {
    background: rgba(56, 189, 248, 0.12);
    color: var(--cn-accent);
}

.cn-statusbar__help {
    padding: 0;
    border: 0;
    background: transparent;
    font: inherit;
    color: inherit;
    cursor: pointer;
}

.cn-statusbar__help:hover {
    color: var(--cn-accent);
}

.cn-statusbar__segment--pending {
    color: var(--cn-accent);
}

.cn-statusbar__divider {
    width: 1px;
    height: 12px;
    background: var(--cn-line);
}
</style>
