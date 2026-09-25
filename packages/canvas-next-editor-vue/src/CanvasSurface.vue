<script setup lang="ts">
/**
 * <CanvasSurface>：双层画布表面组件（工单 05）。
 *
 * - 内容层 + gizmo 覆盖层两层 canvas，覆盖层 pointer-events: none；
 *   重绘全部由 editor 会话内部合帧驱动（组件不订阅 store 驱动重绘）。
 * - 事件桥：wheel 三态语义（classifyWheel）→ 会话相机动作；中键/空格+左键拖拽平移。
 * - 呈现环境：ResizeObserver 重设视口尺寸、matchMedia 监听 dpr 变更并重设物理
 *   缓冲（缩放物理像素清晰）；contextlost/restored 强制全量重绘。
 * - DOM 装配完成后 emit ready（带两层 canvas），宿主在其回调里构建渲染后端、
 *   打开文档（见 playground App.vue 的用法）。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { classifyWheel, type EditorSession } from '@hankchen/canvas-next-editor'

export interface CanvasSurfaceReady {
    contentCanvas: HTMLCanvasElement
    overlayCanvas: HTMLCanvasElement
}

const props = defineProps<{ editor: EditorSession }>()

const emit = defineEmits<{ ready: [surface: CanvasSurfaceReady] }>()

const hostRef = ref<HTMLDivElement | null>(null)
const contentRef = ref<HTMLCanvasElement | null>(null)
const overlayRef = ref<HTMLCanvasElement | null>(null)

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

    // dpr 变更（跨屏拖动 / 页面缩放）经分辨率媒体查询自再注册（MDN 标准手法）
    let dprMedia: MediaQueryList | null = null
    const watchDpr = () => {
        dprMedia?.removeEventListener('change', watchDpr)
        editor.setDevicePixelRatio(window.devicePixelRatio)
        resizeBuffers()
        dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
        dprMedia.addEventListener('change', watchDpr)
    }
    watchDpr()
    teardown.push(() => dprMedia?.removeEventListener('change', watchDpr))

    // ---- 事件桥 ----
    const hostPoint = (e: WheelEvent | PointerEvent): { x: number; y: number } => {
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

    // 拖拽平移：中键或空格+左键（空格按住期间光标呈抓手）
    let pointerId: number | null = null
    let last: { x: number; y: number } = { x: 0, y: 0 }

    const onPointerDown = (e: PointerEvent) => {
        const wantPan = e.button === 1 || (e.button === 0 && spaceHeld.value)
        if (!wantPan || pointerId !== null) return
        e.preventDefault()
        pointerId = e.pointerId
        last = { x: e.clientX, y: e.clientY }
        panning.value = true
        host.setPointerCapture(e.pointerId)
    }

    const onPointerMove = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        // 抓取语义：内容跟随指针（拖向右 = 相机向左）
        editor.panBy(e.clientX - last.x, e.clientY - last.y)
        last = { x: e.clientX, y: e.clientY }
    }

    const endPan = (e: PointerEvent) => {
        if (e.pointerId !== pointerId) return
        pointerId = null
        panning.value = false
        if (host.hasPointerCapture(e.pointerId)) host.releasePointerCapture(e.pointerId)
    }

    // 中键默认行为（自动滚动）在 mousedown 阶段拦
    const onMouseDown = (e: MouseEvent) => {
        if (e.button === 1) e.preventDefault()
    }

    host.addEventListener('pointerdown', onPointerDown)
    host.addEventListener('pointermove', onPointerMove)
    host.addEventListener('pointerup', endPan)
    host.addEventListener('pointercancel', endPan)
    host.addEventListener('mousedown', onMouseDown)
    teardown.push(() => {
        host.removeEventListener('pointerdown', onPointerDown)
        host.removeEventListener('pointermove', onPointerMove)
        host.removeEventListener('pointerup', endPan)
        host.removeEventListener('pointercancel', endPan)
        host.removeEventListener('mousedown', onMouseDown)
    })

    // 空格按住跟踪（窗口级：焦点可能在页面任意处）；可编辑元素/按钮不拦
    const isEditableTarget = (target: EventTarget | null): boolean => {
        if (!(target instanceof HTMLElement)) return false
        if (target.isContentEditable) return true
        const tag = target.tagName
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON'
    }

    const onKeyDown = (e: KeyboardEvent) => {
        if (e.code !== 'Space' || e.repeat || isEditableTarget(e.target)) return
        e.preventDefault() // 空格默认滚动页面
        spaceHeld.value = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') spaceHeld.value = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    teardown.push(() => {
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
    })

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
