<script setup lang="ts">
/**
 * <CanvasSurface>：双层画布表面组件（工单 05 起步，工单 06 接选择/拖动管线）。
 *
 * - 内容层 + gizmo 覆盖层两层 canvas，覆盖层 pointer-events: none；
 *   重绘全部由 editor 会话内部合帧驱动（组件不订阅 store 驱动重绘）。
 * - 事件桥：wheel 三态语义（classifyWheel）→ 会话相机动作；中键/空格+左键拖拽平移；
 *   左键点选与拖动（selectAt/beginDrag/dragTo/endDrag）、hover 跟随、Escape 升级
 *   选择归属链——全部经内核意图级 API，组件只做坐标与指针状态翻译。
 * - 文本编辑（工单 11）：宿主内挂 TextEditingOverlay，双击进入（命中 TextLayer）、
 *   编辑中点 textarea 外先提交再点选、textarea 内指针归编辑光标。
 * - 右键菜单（工单 14）：contextmenu → 场景命中即右键选中 → 视口坐标开菜单
 *   （ContextMenu 内挂组件）；Escape/画布点按/动作执行即关。
 * - 呈现环境：ResizeObserver 重设视口尺寸、matchMedia 监听 dpr 变更并重设物理
 *   缓冲（缩放物理像素清晰）；contextlost/restored 强制全量重绘。
 * - DOM 装配完成后 emit ready（带两层 canvas），宿主在其回调里构建渲染后端、
 *   打开文档（见 playground App.vue 的用法）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { classifyWheel, type EditorSession } from '@hankchen/canvas-next-editor'

import ContextMenu from './ContextMenu.vue'
import { isEditableEventTarget } from './editableTarget'
import TextEditingOverlay from './TextEditingOverlay.vue'
import { watchDprChanges } from './useDpr'

export interface CanvasSurfaceReady {
    contentCanvas: HTMLCanvasElement
    overlayCanvas: HTMLCanvasElement
}

const props = defineProps<{ editor: EditorSession }>()

const emit = defineEmits<{ ready: [surface: CanvasSurfaceReady] }>()

const hostRef = ref<HTMLDivElement | null>(null)
const contentRef = ref<HTMLCanvasElement | null>(null)
const overlayRef = ref<HTMLCanvasElement | null>(null)
const textEditRef = ref<InstanceType<typeof TextEditingOverlay> | null>(null)
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null)

const spaceHeld = ref(false)
const panning = ref(false)
const cursorClass = computed(() =>
    panning.value ? 'cn-surface--panning' : spaceHeld.value ? 'cn-surface--pannable' : '',
)

const teardown: (() => void)[] = []

onMounted(() => {
    const host = hostRef.value
    const content = contentRef.value
    const overlay = overlayRef.value
    if (!host || !content || !overlay) return
    const editor = props.editor

    // ---- 呈现环境：尺寸 / dpr / 物理缓冲 ----
    const resizeBuffers = () => {
        const dpr = window.devicePixelRatio
        const width = Math.max(1, Math.round(host.clientWidth * dpr))
        const height = Math.max(1, Math.round(host.clientHeight * dpr))
        for (const canvas of [content, overlay]) {
            // 重设尺寸会清空缓冲，随后由会话的合帧重绘补上
            if (canvas.width !== width) canvas.width = width
            if (canvas.height !== height) canvas.height = height
        }
    }

    const applySurfaceSize = () => {
        editor.setSurfaceSize(host.clientWidth, host.clientHeight)
        resizeBuffers()
    }

    editor.setDevicePixelRatio(window.devicePixelRatio)
    applySurfaceSize()

    const observer = new ResizeObserver(applySurfaceSize)
    observer.observe(host)
    teardown.push(() => observer.disconnect())

    // dpr 变更（跨屏拖动 / 页面缩放）经分辨率媒体查询自再注册（useDpr 共用口径）
    const stopDpr = watchDprChanges(() => {
        editor.setDevicePixelRatio(window.devicePixelRatio)
        resizeBuffers()
    })
    teardown.push(stopDpr)

    // ---- 事件桥 ----
    const hostPoint = (e: WheelEvent | PointerEvent | MouseEvent): { x: number; y: number } => {
        const rect = host.getBoundingClientRect()
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }

    // deltaMode 折算系数：行/页单位（Firefox）换算成近似像素再进相机
    const deltaModeScale = (e: WheelEvent): number => {
        if (e.deltaMode === 1) return 16
        if (e.deltaMode === 2) return 100
        return 1
    }

    const onWheel = (e: WheelEvent) => {
        // 画布导航独占滚轮：拦下 ctrl+wheel 的浏览器页面缩放与 plain wheel 的页面滚动
        e.preventDefault()
        const scale = deltaModeScale(e)
        const point = hostPoint(e)
        const intent = classifyWheel(e)
        if (intent === 'zoom') {
            editor.zoomByWheel(point.x, point.y, e.deltaY * scale)
        } else if (intent === 'pan-x') {
            // Mac 的 shift+wheel 常给 deltaX；有 deltaY 时优先（excalidraw 同款）。
            // 滚轮是「滚动」语义：delta 正 = 视口移向场景正方向，与拖拽增量反号
            editor.panBy(-(e.deltaY || e.deltaX) * scale, 0)
        } else {
            editor.panBy(-e.deltaX * scale, -e.deltaY * scale)
        }
    }
    host.addEventListener('wheel', onWheel, { passive: false })
    teardown.push(() => host.removeEventListener('wheel', onWheel))

    // 拖拽平移（中键/空格+左键）与选择/拖动图层（左键）共用一个活跃指针：
    // mode 'pan' 抓取相机，'drag' 移动选中图层（内核侧记录会话与事务合并）
    let active: { id: number; mode: 'pan' | 'drag' } | null = null
    let last: { x: number; y: number } = { x: 0, y: 0 }

    const sceneAt = (e: PointerEvent) => {
        const point = hostPoint(e)
        return editor.toScenePoint(point.x, point.y)
    }

    const onPointerDown = (e: PointerEvent) => {
        contextMenuRef.value?.close() // 菜单内点按被 stop 拦下，到这里的都是菜单外
        if (active !== null) return
        const wantPan = e.button === 1 || (e.button === 0 && spaceHeld.value)
        if (wantPan) {
            e.preventDefault()
            active = { id: e.pointerId, mode: 'pan' }
            last = { x: e.clientX, y: e.clientY }
            panning.value = true
            host.setPointerCapture(e.pointerId)
            return
        }
        if (e.button !== 0) return
        // 文本编辑中（工单 11）：textarea 内的指针交给编辑光标（不点选/拖动）；
        // 画布其他处先提交编辑（「点画布其他处」退出路径），同一次点按继续点选
        if (textEditRef.value?.isEditing()) {
            if (textEditRef.value.ownsEventTarget(e.target)) return
            textEditRef.value.commitEditing()
        }
        e.preventDefault()
        // 点选：命中即选中（画布与后续面板同源），命中层同时进入拖动会话
        const scene = sceneAt(e)
        const path = editor.selectAt(scene.x, scene.y)
        if (path && editor.beginDrag(path, scene.x, scene.y)) {
            active = { id: e.pointerId, mode: 'drag' }
            host.setPointerCapture(e.pointerId)
        }
    }

    const onPointerMove = (e: PointerEvent) => {
        if (active !== null) {
            if (e.pointerId !== active.id) return
            if (active.mode === 'pan') {
                // 抓取语义：内容跟随指针（拖向右 = 相机向左）
                editor.panBy(e.clientX - last.x, e.clientY - last.y)
                last = { x: e.clientX, y: e.clientY }
            } else {
                const scene = sceneAt(e)
                editor.dragTo(scene.x, scene.y)
            }
            return
        }
        // 无手势时悬停跟随（gizmo hover 高亮；值等短路在内核，移动中不重绘）
        const scene = sceneAt(e)
        editor.hoverAt(scene.x, scene.y)
    }

    const onPointerUp = (e: PointerEvent) => {
        if (active === null || e.pointerId !== active.id) return
        if (active.mode === 'drag') {
            editor.endDrag() // 闭合 mergeKey 事务：一次拖动 = 一步历史
        } else {
            panning.value = false
        }
        active = null
        if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId)
    }

    // 中键默认行为（自动滚动）在 mousedown 阶段拦
    const onMouseDown = (e: MouseEvent) => {
        if (e.button === 1) e.preventDefault()
    }

    // 双击进入文本编辑（工单 11）：场景点命中 TextLayer 才生效（内核校验类型）
    const onDblClick = (e: MouseEvent) => {
        const point = hostPoint(e)
        const scene = editor.toScenePoint(point.x, point.y)
        textEditRef.value?.beginAt(scene.x, scene.y)
    }

    // 右键菜单（工单 14）：命中即右键选中（excalidraw 同款）并按视口坐标开菜单；
    // 未命中关菜单。编辑中与左键同流：textarea 外右键先提交编辑再点选（防菜单在
    // 编辑态删层）；textarea 内右键交浏览器原生菜单（文本编辑的原生操作面）。
    const onContextMenu = (e: MouseEvent) => {
        if (textEditRef.value?.isEditing()) {
            if (textEditRef.value.ownsEventTarget(e.target)) return
            textEditRef.value.commitEditing()
        }
        e.preventDefault()
        const point = hostPoint(e)
        const scene = editor.toScenePoint(point.x, point.y)
        if (editor.selectAt(scene.x, scene.y) === null) {
            contextMenuRef.value?.close()
            return
        }
        void contextMenuRef.value?.openAt(point.x, point.y)
    }

    // 指针离场清 hover（拖动/平移中由抓取接管，无需处理）
    const onPointerLeave = () => {
        if (active === null) editor.setHovered(null)
    }

    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerup', onPointerUp)
    host.addEventListener('pointercancel', onPointerUp)
    host.addEventListener('pointerleave', onPointerLeave)
    host.addEventListener('mousedown', onMouseDown)
    host.addEventListener('dblclick', onDblClick)
    teardown.push(() => {
        host.removeEventListener('pointerdown', onPointerDown)
        host.removeEventListener('pointermove', onPointerMove)
        host.removeEventListener('pointerup', onPointerUp)
        host.removeEventListener('pointercancel', onPointerUp)
        host.removeEventListener('pointerleave', onPointerLeave)
        host.removeEventListener('mousedown', onMouseDown)
        host.removeEventListener('dblclick', onDblClick)
    })

    // 空格按住跟踪（窗口级：焦点可能在页面任意处）；可编辑元素/按钮不拦
    // （判定与快捷键让路同一口径：editableTarget.isEditableEventTarget）
    const isEditableTarget = isEditableEventTarget

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.code !== 'Space' || e.repeat || isEditableTarget(e.target)) return
        e.preventDefault() // 空格默认滚动页面
        spaceHeld.value = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') spaceHeld.value = false
    }
    // Escape 升级选择归属链（格→行→表→清空）；输入法/输入框内不拦；顺带关右键菜单
    const onEscape = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || isEditableTarget(e.target)) return
        contextMenuRef.value?.close()
        editor.escapeSelection()
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('keydown', onEscape)
    teardown.push(() => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('keydown', onEscape)
    })

    host.addEventListener('contextmenu', onContextMenu)
    teardown.push(() => host.removeEventListener('contextmenu', onContextMenu))

    // 2D context 同样存在 contextlost；默认自动恢复，恢复后强制全量重绘（MDN）
    const onContextRestored = () => editor.invalidate('both')
    const onContextLost = (e: Event) => e.preventDefault()
    content.addEventListener('contextlost', onContextLost)
    content.addEventListener('contextrestored', onContextRestored)
    overlay.addEventListener('contextlost', onContextLost)
    overlay.addEventListener('contextrestored', onContextRestored)
    teardown.push(() => {
        content.removeEventListener('contextlost', onContextLost)
        content.removeEventListener('contextrestored', onContextRestored)
        overlay.removeEventListener('contextlost', onContextLost)
        overlay.removeEventListener('contextrestored', onContextRestored)
    })

    emit('ready', { contentCanvas: content, overlayCanvas: overlay })
})

onBeforeUnmount(() => {
    teardown.forEach((fn) => fn())
    teardown.length = 0
    props.editor.detachSurfaces()
})
</script>

<template>
    <div ref="hostRef" class="cn-surface" :class="cursorClass">
        <canvas ref="contentRef" class="cn-surface__canvas"></canvas>
        <canvas ref="overlayRef" class="cn-surface__canvas cn-surface__canvas--overlay"></canvas>
        <TextEditingOverlay ref="textEditRef" :editor="editor" />
        <ContextMenu ref="contextMenuRef" :editor="editor" />
    </div>
</template>

<style scoped>
.cn-surface {
    position: relative;
    overflow: hidden;
    /* 触屏手势不与画布导航争抢；拖拽期间不选中文本 */
    touch-action: none;
    user-select: none;
}

.cn-surface__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
}

.cn-surface__canvas--overlay {
    pointer-events: none;
}

.cn-surface--pannable {
    cursor: grab;
}

.cn-surface--panning {
    cursor: grabbing;
}
</style>
