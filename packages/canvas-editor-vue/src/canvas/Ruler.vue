<script setup lang="ts">
/**
 * Ruler：画布域标尺组件（ruler-guides-snap 工单 02，ADR 0012）。
 *
 * 顶+左双条 px 刻度 + 角块：0 点=画布左上（视口原点即场景 0，条上位置 =
 * (场景值 − viewport.x/y) × zoom，与内容层同一呈现视口联动——读 ui.viewport
 * 分支，平移/缩放实时联动）。刻度密度按缩放自适应：副刻度走 1-2-5 阶梯取
 * 「屏幕间距不低于 TICK_MIN_SPACING_PX」的最小档，主刻度 = 5×副刻度、带读数。
 *
 * 常显、开关态只读内核：⇧R → shortcuts 注册表 → toggleRulers → ui.rulersVisible
 * 分支通知，组件随显随隐（键位随内核注册表自带，组件零键位代码）。
 *
 * 标尺条承载「拖出参考线」手势起点：顶条按下 → 垂直参考线、左条 → 水平参考线
 * （方向判定），按下/移动/抬起发 guide-drag-start/move/end，载荷为轴向 + 场景
 * 坐标（RulerGuideGesture）；pointercancel（系统接管指针，如触屏边缘滑出）单发
 * guide-drag-cancel——与抬手落线区分，工单 03 落线时据此丢弃被中断的手势。
 * 参考线的落线、预览与拖回删除归工单 03 的参考线层，本组件不调 addGuide/
 * removeGuide。指针抓取（setPointerCapture）保证拖出途中指针滑入画布仍持续
 * 送达标尺条。
 *
 * 挂载契约（归宿主，工单 04）：组件自身不含页面定位——根铺满宿主给的挂载点
 * （如画布容器上的 absolute inset:0 壳），两条只锚定根内上缘/左缘；条的外缘
 * 与画布内容区对应边贴边对齐，条内偏移才等于内容区偏移（手势坐标换算前提）。
 * 逐件 data-ruler-* 目验钩子；两条 role="img" + aria-label + title（刻度读数
 * 是装饰性数字，随 role 语义对读屏隐去）。
 */
import { computed, onBeforeUnmount, onMounted, onScopeDispose, ref, shallowRef } from 'vue'

import type { EditorSession, GuideOrientation } from '@hankchen/canvas-editor'

import { useViewport } from '../shared/useViewport'

/** 标尺拖出参考线的手势载荷（工单 03 参考线层消费）：轴向 + 场景坐标 */
export interface RulerGuideGesture {
    readonly orientation: GuideOrientation
    readonly position: number
}

const props = defineProps<{ editor: EditorSession }>()

const emit = defineEmits<{
    'guide-drag-start': [gesture: RulerGuideGesture]
    'guide-drag-move': [gesture: RulerGuideGesture]
    'guide-drag-end': [gesture: RulerGuideGesture]
    'guide-drag-cancel': [gesture: RulerGuideGesture]
}>()

// ---- 视口与开关态（ui 分支桥，useViewport 同款模式） ----

const viewport = useViewport(props.editor)

const rulersVisible = shallowRef(props.editor.store.ui.rulersVisible)
const unsubscribe = props.editor.subscribe((change) => {
    if (change.scope === 'ui' && change.branch === 'rulersVisible') {
        rulersVisible.value = props.editor.store.ui.rulersVisible
    }
})
// failSilently：测试可在无 effect scope 的环境调用
onScopeDispose(unsubscribe, true)

// ---- 刻度几何（纯函数）：1-2-5 阶梯按缩放换档 ----

/** 副刻度最小屏幕间距（css px）：低于此间距的档位不放，缩放联动靠换档实现 */
const TICK_MIN_SPACING_PX = 10

/** 副刻度阶梯（场景 px，1-2-5 十进阶）；zoom 边界 5%–800% 内末档必够用 */
const MINOR_STEP_LADDER = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000] as const

/** 主刻度 = 5×副刻度（读数档） */
const MAJOR_PER_MINOR = 5

interface RulerTick {
    /** 场景坐标（v-for key：平移时逐帧稳定，复用 DOM） */
    readonly scene: number
    /** 条内屏幕位置（css px） */
    readonly position: number
    /** 主刻度读数；副刻度为 null */
    readonly label: string | null
}

/**
 * 一条标尺的刻度序列：origin = 视口原点沿轴的场景坐标（x 或 y），length = 条的
 * 可见长度（屏幕 px）。首刻度向前取整覆盖条缘（负位刻度跳过，不画半截），末刻度
 * 不越过条长；读数只在主刻度上。
 */
function buildTicks(origin: number, length: number, zoom: number): RulerTick[] {
    if (!(length > 0) || !(zoom > 0) || !Number.isFinite(origin)) return []
    let minor = MINOR_STEP_LADDER[MINOR_STEP_LADDER.length - 1]!
    for (const step of MINOR_STEP_LADDER) {
        if (step * zoom >= TICK_MIN_SPACING_PX) {
            minor = step
            break
        }
    }
    const major = minor * MAJOR_PER_MINOR
    const first = Math.floor(origin / minor) * minor
    const ticks: RulerTick[] = []
    // 逐档累进（i 索引避免浮点累加漂移）；minor×zoom ≥ 间距下限保证步进有界
    for (let i = 0; ; i++) {
        const scene = first + i * minor
        const position = (scene - origin) * zoom
        if (position > length) break
        if (position >= 0) {
            const k = scene / major
            const isMajor = Math.abs(k - Math.round(k)) < 1e-6
            ticks.push({ scene, position, label: isMajor ? String(Math.round(scene)) : null })
        }
    }
    return ticks
}

/** 两条的可见长度（jsdom 无布局置 0 → 空刻度；ResizeObserver 补测） */
const topRef = ref<HTMLElement | null>(null)
const leftRef = ref<HTMLElement | null>(null)
const topWidth = ref(0)
const leftHeight = ref(0)

const measure = (): void => {
    topWidth.value = topRef.value?.clientWidth ?? 0
    leftHeight.value = leftRef.value?.clientHeight ?? 0
}

let observer: ResizeObserver | null = null
onMounted(() => {
    measure()
    // v-show 保挂：开关只切根显隐，两条不被摘除，观察句柄全程有效
    observer = new ResizeObserver(() => measure())
    if (topRef.value) observer.observe(topRef.value)
    if (leftRef.value) observer.observe(leftRef.value)
})
onBeforeUnmount(() => observer?.disconnect())

const topTicks = computed(() => buildTicks(viewport.value.x, topWidth.value, viewport.value.zoom))
const leftTicks = computed(() => buildTicks(viewport.value.y, leftHeight.value, viewport.value.zoom))

// ---- 拖出参考线手势（起点在此，落线归工单 03） ----

const drag = ref<{ pointerId: number; orientation: GuideOrientation } | null>(null)

/** 指针沿条轴的场景坐标：条外缘与内容区贴边对齐（挂载契约），条内偏移即内容区偏移 */
function gestureAt(bar: HTMLElement, orientation: GuideOrientation, e: PointerEvent): RulerGuideGesture {
    const rect = bar.getBoundingClientRect()
    const v = viewport.value
    const position =
        orientation === 'vertical'
            ? v.x + (e.clientX - rect.left) / v.zoom
            : v.y + (e.clientY - rect.top) / v.zoom
    return { orientation, position }
}

function startDrag(e: PointerEvent, orientation: GuideOrientation): void {
    const bar = e.currentTarget
    if (!(bar instanceof HTMLElement) || e.button !== 0 || drag.value !== null) return
    e.preventDefault()
    drag.value = { pointerId: e.pointerId, orientation }
    // 抓取失败不拦手势：真实指针在 pointerdown 时调用恒成功；jsdom 无活跃指针表
    // 会抛错（测试事件直发条上，无需抓取）
    try {
        bar.setPointerCapture(e.pointerId)
    } catch {
        // jsdom：无活跃指针表，抓取不可用
    }
    emit('guide-drag-start', gestureAt(bar, orientation, e))
}

function moveDrag(e: PointerEvent): void {
    const bar = e.currentTarget
    const active = drag.value
    if (!(bar instanceof HTMLElement) || active === null || e.pointerId !== active.pointerId) return
    emit('guide-drag-move', gestureAt(bar, active.orientation, e))
}

/** 手势收束（抬手=落线候选，取消=系统接管指针）；事件名区分语义，载荷同形 */
function finishDrag(e: PointerEvent, event: 'guide-drag-end' | 'guide-drag-cancel'): void {
    const bar = e.currentTarget
    const active = drag.value
    if (!(bar instanceof HTMLElement) || active === null || e.pointerId !== active.pointerId) return
    drag.value = null
    try {
        bar.releasePointerCapture(e.pointerId)
    } catch {
        // jsdom：无活跃指针表，同 pointerdown
    }
    const gesture = gestureAt(bar, active.orientation, e)
    // emits 类型是按事件名的重载，联合键不过载——按名分派
    if (event === 'guide-drag-end') emit('guide-drag-end', gesture)
    else emit('guide-drag-cancel', gesture)
}
</script>

<template>
    <div v-show="rulersVisible" class="cn-ruler" data-ruler>
        <div
            ref="topRef"
            class="cn-ruler__bar cn-ruler__bar--top"
            data-ruler-top
            role="img"
            aria-label="水平标尺"
            title="水平标尺（拖出垂直参考线）"
            @pointerdown="startDrag($event, 'vertical')"
            @pointermove="moveDrag($event)"
            @pointerup="finishDrag($event, 'guide-drag-end')"
            @pointercancel="finishDrag($event, 'guide-drag-cancel')"
        >
            <span
                v-for="tick in topTicks"
                :key="tick.scene"
                class="cn-ruler__tick"
                :class="{ 'cn-ruler__tick--major': tick.label !== null }"
                :style="{ left: `${tick.position}px` }"
            >
                <span v-if="tick.label !== null" class="cn-ruler__label">{{ tick.label }}</span>
            </span>
        </div>
        <div
            ref="leftRef"
            class="cn-ruler__bar cn-ruler__bar--left"
            data-ruler-left
            role="img"
            aria-label="垂直标尺"
            title="垂直标尺（拖出水平参考线）"
            @pointerdown="startDrag($event, 'horizontal')"
            @pointermove="moveDrag($event)"
            @pointerup="finishDrag($event, 'guide-drag-end')"
            @pointercancel="finishDrag($event, 'guide-drag-cancel')"
        >
            <span
                v-for="tick in leftTicks"
                :key="tick.scene"
                class="cn-ruler__tick"
                :class="{ 'cn-ruler__tick--major': tick.label !== null }"
                :style="{ top: `${tick.position}px` }"
            >
                <span v-if="tick.label !== null" class="cn-ruler__label">{{ tick.label }}</span>
            </span>
        </div>
        <div class="cn-ruler__corner" data-ruler-corner aria-hidden="true"></div>
    </div>
</template>

<style scoped>
/* 暗色令牌与壳层/浮条同族（#0b1220 族，值同 playground --shell-* 与 AlignFloatBar
   内联令牌）：标尺自带主题、不依赖宿主接线；厚度留 CSS 变量供宿主覆盖。
   组件自身不含页面定位——根铺满宿主给的挂载点，两条只锚定根内两缘（工单 04）。 */
.cn-ruler {
    --cn-ruler-thickness: 20px;
    --cn-ruler-bg: rgb(11 18 32 / 0.92);
    --cn-ruler-line: #1e2a40;
    --cn-ruler-tick: #7c8ca5;
    --cn-ruler-label: #aab6c8;
    --cn-ruler-font: 'SF Mono', Menlo, Consolas, monospace;

    position: relative;
    width: 100%;
    height: 100%;
    /* 根不拦事件，两条自收——条外画布交互不受影响（对齐浮条兄弟挂点同款考量） */
    pointer-events: none;
    user-select: none;
    font-family: var(--cn-ruler-font);
}

.cn-ruler__bar {
    position: absolute;
    top: 0;
    left: 0;
    overflow: hidden;
    pointer-events: auto;
    /* 触屏拖参考线不与页面手势争抢（同画布表面 touch-action 口径） */
    touch-action: none;
    background: var(--cn-ruler-bg);
}

/* 顶条：横贯上缘，刻度自下缘（内侧）竖直长出 */
.cn-ruler__bar--top {
    right: 0;
    height: var(--cn-ruler-thickness);
    border-bottom: 1px solid var(--cn-ruler-line);
}

/* 左条：纵贯左缘，刻度自右缘（内侧）水平长出 */
.cn-ruler__bar--left {
    bottom: 0;
    width: var(--cn-ruler-thickness);
    border-right: 1px solid var(--cn-ruler-line);
}

/* 角块：双条交汇处盖住叠底 */
.cn-ruler__corner {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1;
    width: var(--cn-ruler-thickness);
    height: var(--cn-ruler-thickness);
    background: var(--cn-ruler-bg);
    border-right: 1px solid var(--cn-ruler-line);
    border-bottom: 1px solid var(--cn-ruler-line);
}

.cn-ruler__tick {
    position: absolute;
    background: var(--cn-ruler-tick);
}

.cn-ruler__bar--top .cn-ruler__tick {
    bottom: 0;
    width: 1px;
    height: 4px;
}

.cn-ruler__bar--top .cn-ruler__tick--major {
    height: 8px;
}

.cn-ruler__bar--left .cn-ruler__tick {
    right: 0;
    width: 4px;
    height: 1px;
}

.cn-ruler__bar--left .cn-ruler__tick--major {
    width: 8px;
}

/* 读数：顶条水平排在刻度上方；左条窄（厚度 20px）容不下横排多位数，竖排
   （y 轴惯例）沿条长伸展——位数只吃档距（≥50px），不吃条宽。溢出条端由
   overflow 裁剪。 */
.cn-ruler__label {
    position: absolute;
    font-size: 9px;
    line-height: 1;
    white-space: nowrap;
    color: var(--cn-ruler-label);
}

.cn-ruler__bar--top .cn-ruler__label {
    bottom: 9px;
    left: 3px;
}

.cn-ruler__bar--left .cn-ruler__label {
    top: 2px;
    right: 10px;
    writing-mode: vertical-rl;
}
</style>
