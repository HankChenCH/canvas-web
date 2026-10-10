<script setup lang="ts">
/**
 * GuidesOverlay：画布域参考线层（ruler-guides-snap 工单 03，ADR 0012）。
 *
 * 呈现通道评估（工单前置问题）：gizmo 同款 OverlayPainter 缝是 canvas 绘制，
 * 给不了两样本工单要的东西——data-guide-* 与 data-snap-* 目验钩子（工单 04 自动化
 * 锚点，需要真实元素）与参考线上的指针事件（拖回删除手势；overlay canvas 是
 * pointer-events:none）。故按 spec 决策 4 预留的支路开 DOM 呈现层：根铺满宿主
 * 挂载点、pointer-events:none，只有参考线命中条留事件，吸附线纯回显。
 *
 * 两个概念（根 CONTEXT.md，视觉必须可区分）：
 * - 参考线（guide）：使用者从标尺拖出的会话级对位轴——读内核 listGuides，横跨
 *   可视窗口实线（自标尺条底下起线），驻留到拖回标尺删除；
 * - 吸附线（snap line）：拖动会话命中吸附轴的瞬时回显——读内核命中轴查询
 *   （store.ui.snapAxes，dragTo 写入 / endDrag 清空），虚线区分，松手即消失。
 *
 * 标尺拖出参考线的落点在宿主接线（工单 04）：Ruler 的 guide-drag-* 四事件经宿主
 * 转发到本组件 defineExpose 的同名四方法（载荷 RulerGuideGesture，场景坐标）。
 * 拖出途中预览线自身吸附——复用内核同一吸附数学（guideSnap.snapGuideAxis，源 =
 * 可见根层盒缘与中心 + 画布中轴 + 已有参考线）；抬手落线调 addGuide，落点恰在
 * 既有同向参考线轴上则跳过（吸附贴合防双线）；guide-drag-cancel（系统接管指针）
 * 丢弃中断手势不落线。
 *
 * 拖动再定位：参考线命中条上按下抓取，线随指针吸附跟随（复用拖出落线同一吸附
 * 数学，excludeGuideId 排除自身轴防原位粘滞）；松手三歧——落点在标尺条上
 * （document.elementFromPoint 命中 data-ruler-*，钩子即判定面、不感知宿主挂载
 * 几何）调 removeGuide（拖回删除）；落点恰在既有同向参考线轴上（吸附贴合所致）
 * 合并删除被拖线（防同轴双线，与拖出落线同门）；其余落点 updateGuide 原位改写
 * （吸附后位置，未拖动即内核位——点击不拖零副作用）。
 *
 * 与内容层同一呈现视口（读 ui.viewport 分支）：线上轴向位置 = (场景值 − viewport
 * 原点) × zoom。挂载契约同 Ruler：根铺满宿主给的挂载点（与画布内容区重合），
 * 页面定位归宿主（工单 04）；根 overflow:hidden + 壳层同族圆角把满幅线体裁进
 * 可视窗口（挂点次序保证标尺条盖在参考线之上——线自标尺底下钻出）。
 */
import { computed, onScopeDispose, ref, shallowRef } from 'vue'

import type {
    EditorSession,
    GuideOrientation,
    SnapAxis,
} from '@hankchen/canvas-editor'

import { snapGuideAxis } from './guideSnap'
import type { RulerGuideGesture } from './Ruler.vue'
import { useViewport } from '../shared/useViewport'

const props = defineProps<{ editor: EditorSession }>()

// ---- 内核态桥（ui 分支通知 → 本地 shallowRef；doc 换档全量重读） ----

const viewport = useViewport(props.editor)
const doc = shallowRef(props.editor.store.doc)
const guides = shallowRef(props.editor.listGuides())
// 吸附线读内核命中轴只读查询（spec 决策 1 的对外查询面 listSnapAxes），
// 响应式订阅走 ui.snapAxes 分支通知
const snapAxes = shallowRef<readonly SnapAxis[]>(props.editor.listSnapAxes())

const unsubscribe = props.editor.subscribe((change) => {
    if (change.scope === 'doc') {
        // openDocument 重置参考线与命中轴但只发 doc 通知（store.reset 语义）
        doc.value = props.editor.store.doc
        guides.value = props.editor.listGuides()
        snapAxes.value = props.editor.listSnapAxes()
        return
    }
    if (change.branch === 'guides') guides.value = props.editor.listGuides()
    else if (change.branch === 'snapAxes') snapAxes.value = props.editor.listSnapAxes()
})
// failSilently：测试可在无 effect scope 的环境调用
onScopeDispose(unsubscribe, true)

// ---- 几何：场景 → 挂载点屏幕坐标（与 Ruler 条内偏移同一换算式） ----

/**
 * 线体沿轴向满幅（对标行业：自标尺条底下起线、横跨整个可视窗口）——轴向定位
 * 随场景值换算，轴向尺寸恒 top/left 0 + 100%，不随视口平移伸缩；可视窗口边缘
 * 的收边归根节点 overflow:hidden + 壳层同族圆角（见样式）。
 */
function lineStyle(orientation: GuideOrientation, position: number): Record<string, string> {
    const d = doc.value
    const v = viewport.value
    if (!d) return { display: 'none' }
    if (orientation === 'vertical') {
        return {
            left: `${(position - v.x) * v.zoom}px`,
            top: '0px',
            height: '100%',
        }
    }
    return {
        top: `${(position - v.y) * v.zoom}px`,
        left: '0px',
        width: '100%',
    }
}

/** 钩子读数保留两位小数（吸附求位的浮点尾差在此收敛，目验断言友好） */
function formatPosition(value: number): string {
    return String(Math.round(value * 100) / 100)
}

// ---- 标尺拖出参考线：预览 + 落线（宿主转发 Ruler 四事件的对接面） ----

const preview = ref<RulerGuideGesture | null>(null)

/** 手势位置经内核同一吸附数学求位（预览与落线同源同值） */
function snapped(gesture: RulerGuideGesture): RulerGuideGesture {
    return {
        orientation: gesture.orientation,
        position: snapGuideAxis(props.editor, gesture.orientation, gesture.position),
    }
}

function beginGuideDrag(gesture: RulerGuideGesture): void {
    preview.value = snapped(gesture)
}

function moveGuideDrag(gesture: RulerGuideGesture): void {
    if (preview.value === null || preview.value.orientation !== gesture.orientation) return
    preview.value = snapped(gesture)
}

function endGuideDrag(gesture: RulerGuideGesture): void {
    if (preview.value === null) return
    preview.value = null
    const { orientation, position } = snapped(gesture)
    // 落点恰在既有同向参考线轴上（吸附贴合所致）跳过落线，防同轴双线
    const exists = props.editor
        .listGuides()
        .some(
            (guide) =>
                guide.orientation === orientation &&
                Math.abs(guide.position - position) < 1e-6,
        )
    if (!exists) props.editor.addGuide({ orientation, position })
}

function cancelGuideDrag(): void {
    preview.value = null
}

defineExpose({ beginGuideDrag, moveGuideDrag, endGuideDrag, cancelGuideDrag })

// ---- 抓取手势：拖动再定位 + 拖回标尺删除 ----

interface GuideVm {
    readonly id: number
    readonly orientation: GuideOrientation
    /** 呈现位置：抓取中随指针（吸附后），其余为内核位 */
    readonly position: number
    readonly dragging: boolean
    readonly overRuler: boolean
}

interface DragBackState {
    readonly id: number
    readonly orientation: GuideOrientation
    readonly pointerId: number
    /** 抓取途中最后吸附位（松手落定值）；未拖动即内核位——点击不拖零副作用 */
    readonly current: number
    readonly overRuler: boolean
}

const dragBack = ref<DragBackState | null>(null)

const guideVms = computed<GuideVm[]>(() =>
    guides.value.map((guide) => {
        const active = dragBack.value
        if (active !== null && active.id === guide.id) {
            return {
                id: guide.id,
                orientation: guide.orientation,
                position: active.current,
                dragging: true,
                overRuler: active.overRuler,
            }
        }
        return {
            id: guide.id,
            orientation: guide.orientation,
            position: guide.position,
            dragging: false,
            overRuler: false,
        }
    }),
)

const rootRef = ref<HTMLElement | null>(null)

/** 指针沿轴向的场景坐标：挂载点与画布内容区重合（挂载契约），根内偏移即内容区偏移 */
function pointerScene(e: PointerEvent, orientation: GuideOrientation): number {
    const rect = rootRef.value?.getBoundingClientRect()
    const v = viewport.value
    const left = rect?.left ?? 0
    const top = rect?.top ?? 0
    return orientation === 'vertical'
        ? v.x + (e.clientX - left) / v.zoom
        : v.y + (e.clientY - top) / v.zoom
}

/** 落点是否在标尺条上（拖回删除判定面）：data-ruler-* 钩子即判定面 */
function isOverRuler(clientX: number, clientY: number): boolean {
    const el = document.elementFromPoint(clientX, clientY)
    return el !== null && el.closest('[data-ruler-top], [data-ruler-left]') !== null
}

function grabCapture(e: PointerEvent): void {
    // 抓取失败不拦手势：真实指针 pointerdown 恒成功；jsdom 无活跃指针表会抛错
    try {
        ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {
        // jsdom：无活跃指针表，抓取不可用
    }
}

function releaseCapture(e: PointerEvent): void {
    try {
        ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
        // jsdom：同抓取
    }
}

function onGuidePointerDown(e: PointerEvent, guide: GuideVm): void {
    if (e.button !== 0 || dragBack.value !== null) return
    e.preventDefault()
    // 命中条一次只抓一条（guard 已挡住抓取中的二次按下）；内核写入只发生在
    // 抬手（标尺 → removeGuide / 同轴贴合 → 合并删除 / 其余 → updateGuide），
    // 抓取途中零内核写入
    dragBack.value = {
        id: guide.id,
        orientation: guide.orientation,
        pointerId: e.pointerId,
        current: guide.position,
        overRuler: false,
    }
    grabCapture(e)
}

function onGuidePointerMove(e: PointerEvent): void {
    const active = dragBack.value
    if (active === null || e.pointerId !== active.pointerId) return
    dragBack.value = {
        ...active,
        // 吸附跟随（与拖出落线同一求位缝）；排除自身轴防原位粘滞
        current: snapGuideAxis(
            props.editor,
            active.orientation,
            pointerScene(e, active.orientation),
            active.id,
        ),
        overRuler: isOverRuler(e.clientX, e.clientY),
    }
}

function onGuidePointerUp(e: PointerEvent): void {
    const active = dragBack.value
    if (active === null || e.pointerId !== active.pointerId) return
    dragBack.value = null
    releaseCapture(e)
    // 松手三歧（头注）：落点在标尺条上（与最后一步 move 同点即同值）拖回删除；
    // 落点恰在既有同向参考线轴上（吸附贴合）合并删除防同轴双线；其余再定位
    if (isOverRuler(e.clientX, e.clientY)) {
        props.editor.removeGuide(active.id)
        return
    }
    const coincides = props.editor
        .listGuides()
        .some(
            (guide) =>
                guide.id !== active.id &&
                guide.orientation === active.orientation &&
                Math.abs(guide.position - active.current) < 1e-6,
        )
    if (coincides) props.editor.removeGuide(active.id)
    else props.editor.updateGuide(active.id, active.current)
}

function onGuidePointerCancel(e: PointerEvent): void {
    const active = dragBack.value
    if (active === null || e.pointerId !== active.pointerId) return
    dragBack.value = null
    releaseCapture(e)
}
</script>

<template>
    <div ref="rootRef" class="cn-guides" data-guide-overlay>
        <!-- 吸附线：瞬时回显垫底（拖动会话命中轴，endDrag 清空即消失） -->
        <div
            v-for="(axis, index) in snapAxes"
            :key="`${axis.orientation}-${axis.position}-${index}`"
            class="cn-guides__snap"
            :class="`cn-guides__snap--${axis.orientation}`"
            data-snap-line
            :data-snap-orientation="axis.orientation"
            :data-snap-position="formatPosition(axis.position)"
            :data-snap-source="axis.source"
            :style="lineStyle(axis.orientation, axis.position)"
        ></div>
        <!-- 会话参考线：驻留实线 + 命中条（拖回标尺删除手势在此） -->
        <div
            v-for="guide in guideVms"
            :key="guide.id"
            class="cn-guides__guide"
            :class="[
                `cn-guides__guide--${guide.orientation}`,
                {
                    'cn-guides__guide--grabbed': guide.dragging,
                    'cn-guides__guide--will-delete': guide.overRuler,
                },
            ]"
            :data-guide-line="guide.id"
            :data-guide-orientation="guide.orientation"
            :data-guide-position="formatPosition(guide.position)"
            :data-guide-dragging="guide.dragging ? '' : undefined"
            :style="lineStyle(guide.orientation, guide.position)"
            @pointerdown="onGuidePointerDown($event, guide)"
            @pointermove="onGuidePointerMove"
            @pointerup="onGuidePointerUp"
            @pointercancel="onGuidePointerCancel"
        ></div>
        <!-- 拖出预览线：手势途中呈吸附后位置，落线转正、取消丢弃 -->
        <div
            v-if="preview"
            class="cn-guides__guide cn-guides__guide--preview"
            :class="`cn-guides__guide--${preview.orientation}`"
            data-guide-preview
            :data-guide-orientation="preview.orientation"
            :data-guide-position="formatPosition(preview.position)"
            :style="lineStyle(preview.orientation, preview.position)"
        ></div>
    </div>
</template>

<style scoped>
/* 暗色令牌与壳层/标尺同族（Ruler 同款 #0b1220 族思路）：参考线层自带主题、
   不依赖宿主接线。参考线与吸附线的视觉区分（根 CONTEXT.md 两概念）：参考线
   实线天青、驻留；吸附线虚线玫红、瞬时回显。命中条厚度与辉光强度留 CSS 变量
   供宿主覆盖。圆角与 .workbench .surface / .ruler-shell 同族（12px）：满幅
   线体裁在壳圆角内，不顶出画布卡片收边。 */
.cn-guides {
    --cn-guide-line: #38bdf8;
    --cn-guide-glow: rgba(56, 189, 248, 0.4);
    --cn-guide-will-delete: #f87171;
    --cn-guide-will-delete-glow: rgba(248, 113, 113, 0.45);
    --cn-snap-line: #fb7185;
    --cn-snap-glow: rgba(251, 113, 133, 0.45);
    --cn-snap-dash: 4px;
    --cn-guide-hit: 9px;
    /* 满幅线体的壳内收边圆角：缺省与 Playground 壳层同族（12px），壳圆角不同的
       宿主覆盖此变量——收边几何归宿主（挂载契约），组件只出覆盖缝 */
    --cn-guide-clip-radius: 12px;

    position: absolute;
    inset: 0;
    overflow: hidden;
    border-radius: var(--cn-guide-clip-radius);
    pointer-events: none;
    user-select: none;
}

/* 参考线：透明命中条承事件，可见细线叠在条中线（::after）——条加宽抓取面 */
.cn-guides__guide {
    position: absolute;
    pointer-events: auto;
    /* 触屏拖回不与页面手势争抢（Ruler 条同款口径） */
    touch-action: none;
}

.cn-guides__guide--vertical {
    width: var(--cn-guide-hit);
    transform: translateX(-50%);
    cursor: ew-resize;
}

.cn-guides__guide--horizontal {
    height: var(--cn-guide-hit);
    transform: translateY(-50%);
    cursor: ns-resize;
}

/* 参考线可见线体：纵横镜像共用线色与辉光，几何各自声明 */
.cn-guides__guide--vertical::after,
.cn-guides__guide--horizontal::after {
    content: '';
    position: absolute;
    background: var(--cn-guide-line);
    /* 细线辉光：亮/暗两种纸面内容上都读得出（实线是纯矩形，box-shadow 最省） */
    box-shadow: 0 0 6px var(--cn-guide-glow);
}

.cn-guides__guide--vertical::after {
    top: 0;
    bottom: 0;
    left: calc(50% - 0.5px);
    width: 1px;
}

.cn-guides__guide--horizontal::after {
    left: 0;
    right: 0;
    top: calc(50% - 0.5px);
    height: 1px;
}

/* 拖出预览：手势途中呈线，微透示意未落定；指针归标尺条，命中条语义关闭 */
.cn-guides__guide--preview {
    pointer-events: none;
}

.cn-guides__guide--preview::after {
    opacity: 0.85;
}

/* 拖回途中弱化；悬到标尺条转删除色（落点判定面 elementFromPoint） */
.cn-guides__guide--grabbed::after {
    opacity: 0.75;
}

.cn-guides__guide--will-delete::after {
    background: var(--cn-guide-will-delete);
    box-shadow: 0 0 6px var(--cn-guide-will-delete-glow);
}

/* 吸附线：瞬时回显，虚线与参考线实线区分；密齿 4/4 比疏齿利落（齿长/齿距同值
   由 --cn-snap-dash 一处定），辉光走 drop-shadow 沿虚线 alpha 出光（box-shadow
   会连透明段一起框亮成实心矩形） */
.cn-guides__snap {
    position: absolute;
    pointer-events: none;
    filter: drop-shadow(0 0 3px var(--cn-snap-glow));
}

.cn-guides__snap--vertical {
    width: 1px;
    background-image: repeating-linear-gradient(
        to bottom,
        var(--cn-snap-line) 0 var(--cn-snap-dash),
        transparent var(--cn-snap-dash) calc(var(--cn-snap-dash) * 2)
    );
}

.cn-guides__snap--horizontal {
    height: 1px;
    background-image: repeating-linear-gradient(
        to right,
        var(--cn-snap-line) 0 var(--cn-snap-dash),
        transparent var(--cn-snap-dash) calc(var(--cn-snap-dash) * 2)
    );
}
</style>
