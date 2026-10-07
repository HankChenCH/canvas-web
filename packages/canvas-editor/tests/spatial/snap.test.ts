/**
 * 拖动吸附数学纯函数（ruler-guides-snap 工单 01，ADR 0012）：
 * - visibleRootBoxes：吸附层盒来源的可见过滤（hitTest 同款）与拖动层自身排除；
 * - snapAxesFromBoxes：轴集合 = 根层盒 L/C/R + T/M/B 缘 + 画布水平/垂直中轴 +
 *   参考线轴（画布四边不设轴——精确贴边归第一批对齐按钮）；
 * - resolveSnap：拖动盒九点对轴命中——阈值含边界、多轴取最近、一次至多
 *   吸一垂直轴 + 一水平轴。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas, LayerBox } from '@hankchen/canvas'

import {
    SNAP_THRESHOLD_SCREEN_PX,
    resolveSnap,
    snapAxesFromBoxes,
    snapThresholdScene,
    visibleRootBoxes,
    type Guide,
    type SnapAxis,
} from '../../src/spatial/snap'
import { textLayer } from '../support/fixtures'

/** 测试用盒（content 切片与盒同形，吸附数学不消费 content） */
const box = (x: number, y: number, width = 100, height = 50): LayerBox => ({
    x,
    y,
    width,
    height,
    contentX: x,
    contentY: y,
    contentWidth: width,
    contentHeight: height,
})

const docWith = (...layers: ReturnType<typeof textLayer>[]): Canvas => ({
    width: 800,
    height: 600,
    layers,
})

describe('visibleRootBoxes：可见过滤 + 拖动层自身排除', () => {
    it('只取可见根层盒，几何与渲染/命中同源（anchor + position 解析）', () => {
        const doc = docWith(
            textLayer({ priority: 20, position: { anchor: 'top-left', x: 30, y: 40 } }),
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 200, y: 60 } }),
        )
        const boxes = visibleRootBoxes(doc, 2)
        expect(boxes).toHaveLength(2)
        expect(boxes[0]).toMatchObject({ x: 30, y: 40, width: 100, height: 50 })
        expect(boxes[1]).toMatchObject({ x: 200, y: 60, width: 100, height: 50 })
    })

    it('隐藏层（visible=false）不供轴（整层跳过，与命中测试同款过滤）', () => {
        const doc = docWith(
            textLayer({ priority: 20, position: { anchor: 'top-left', x: 30, y: 40 } }),
            textLayer({ priority: 10, visible: false, position: { anchor: 'top-left', x: 200, y: 60 } }),
        )
        const boxes = visibleRootBoxes(doc, 2)
        expect(boxes).toHaveLength(1)
        expect(boxes[0]).toMatchObject({ x: 30, y: 40 })
    })

    it('拖动层自身根排除（excludeRootIndex）；越界下标不炸', () => {
        const doc = docWith(
            textLayer({ priority: 30, position: { anchor: 'top-left', x: 30, y: 40 } }),
            textLayer({ priority: 20, position: { anchor: 'top-left', x: 200, y: 60 } }),
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 400, y: 80 } }),
        )
        expect(visibleRootBoxes(doc, 1)).toHaveLength(2)
        expect(visibleRootBoxes(doc, 1).map((b) => b.x)).toEqual([30, 400])
        expect(visibleRootBoxes(doc, 99)).toHaveLength(3)
    })
})

describe('snapAxesFromBoxes：轴集合来源', () => {
    it('根层盒供左/中/右 + 上/中/下缘（source=layer）', () => {
        const axes = snapAxesFromBoxes(800, 600, [box(100, 50, 200, 100)], [])
        expect(axes).toContainEqual({ orientation: 'vertical', position: 100, source: 'layer' })
        expect(axes).toContainEqual({ orientation: 'vertical', position: 200, source: 'layer' })
        expect(axes).toContainEqual({ orientation: 'vertical', position: 300, source: 'layer' })
        expect(axes).toContainEqual({ orientation: 'horizontal', position: 50, source: 'layer' })
        expect(axes).toContainEqual({ orientation: 'horizontal', position: 100, source: 'layer' })
        expect(axes).toContainEqual({ orientation: 'horizontal', position: 150, source: 'layer' })
        expect(axes.filter((a) => a.source === 'layer')).toHaveLength(6)
    })

    it('画布只设水平/垂直中轴（四边不设轴）；source=canvas-center', () => {
        const axes = snapAxesFromBoxes(800, 600, [], [])
        expect(axes).toContainEqual({ orientation: 'vertical', position: 400, source: 'canvas-center' })
        expect(axes).toContainEqual({ orientation: 'horizontal', position: 300, source: 'canvas-center' })
        expect(axes).toHaveLength(2)
    })

    it('参考线按方向供轴（source=guide），与层盒轴并存', () => {
        const guides: Guide[] = [
            { id: 1, orientation: 'vertical', position: 77 },
            { id: 2, orientation: 'horizontal', position: 123 },
        ]
        const axes = snapAxesFromBoxes(800, 600, [box(100, 50)], guides)
        expect(axes).toContainEqual({ orientation: 'vertical', position: 77, source: 'guide' })
        expect(axes).toContainEqual({ orientation: 'horizontal', position: 123, source: 'guide' })
    })
})

describe('snapThresholdScene：屏幕 6px 阈值按缩放换算场景值', () => {
    it('scene = 6 / zoom（放大收紧、放大镜下更精细）', () => {
        expect(SNAP_THRESHOLD_SCREEN_PX).toBe(6)
        expect(snapThresholdScene(1)).toBe(6)
        expect(snapThresholdScene(2)).toBe(3)
        expect(snapThresholdScene(0.5)).toBe(12)
    })
})

describe('resolveSnap：九点命中/阈值边界/多轴取最近', () => {
    it('全部轴超阈值不命中：零修正、无命中轴', () => {
        const axes = snapAxesFromBoxes(800, 600, [box(100, 100)], [])
        const r = resolveSnap(box(210, 0), axes, 5)
        expect(r.dx).toBe(0)
        expect(r.dy).toBe(0)
        expect(r.axes).toEqual([])
    })

    it('阈值含边界：恰在阈值上命中，超出 0.5 即不命中', () => {
        const axes = [{ orientation: 'vertical' as const, position: 205, source: 'layer' as const }]
        const hit = resolveSnap(box(100, 0), axes, 5)
        expect(hit.dx).toBe(5)
        expect(hit.axes).toEqual([{ orientation: 'vertical', position: 205, source: 'layer' }])
        const miss = resolveSnap(box(100, 0), axes, 5.5)
        // 右缘 200 → 205 距离 5 ≤ 5.5 仍命中
        expect(miss.dx).toBe(5)
        const beyond = resolveSnap(box(100, 0), [{ orientation: 'vertical', position: 205.5, source: 'layer' }], 5)
        expect(beyond.dx).toBe(0)
        expect(beyond.axes).toEqual([])
    })

    it('九点对象：左/中/右各自可命中（已对齐 delta=0 也回显命中轴）', () => {
        const axes: SnapAxis[] = [{ orientation: 'vertical', position: 152, source: 'layer' }]
        // 左缘 100 距 152 过远；中点 150 距 2 → 吸中点
        const center = resolveSnap(box(100, 0, 100), axes, 5)
        expect(center.dx).toBe(2)
        // 右缘可命中：轴 200 与右缘恰对齐，dx=0 但回显命中轴
        const right = resolveSnap(box(100, 0, 100), [{ orientation: 'vertical', position: 200, source: 'layer' }], 5)
        expect(right.dx).toBe(0)
        expect(right.axes).toEqual([{ orientation: 'vertical', position: 200, source: 'layer' }])
    })

    it('多轴命中取最近（|delta| 最小者胜）', () => {
        const axes = [
            { orientation: 'vertical' as const, position: 126, source: 'layer' as const },
            { orientation: 'vertical' as const, position: 121, source: 'guide' as const },
        ]
        const r = resolveSnap(box(124, 0), axes, 5)
        expect(r.dx).toBe(2)
        expect(r.axes).toEqual([{ orientation: 'vertical', position: 126, source: 'layer' }])
    })

    it('一次至多吸一垂直轴 + 一水平轴（x/y 独立各取最近）', () => {
        const axes = [
            { orientation: 'vertical' as const, position: 126, source: 'layer' as const },
            { orientation: 'vertical' as const, position: 121, source: 'layer' as const },
            { orientation: 'horizontal' as const, position: 72, source: 'layer' as const },
            { orientation: 'horizontal' as const, position: 68, source: 'canvas-center' as const },
        ]
        // y 点 50/75/100：72 距中点 75 最近（|−3|）→ dy = −3
        const r = resolveSnap(box(124, 50), axes, 5)
        expect(r.dx).toBe(2)
        expect(r.dy).toBe(-3)
        expect(r.axes).toEqual([
            { orientation: 'vertical', position: 126, source: 'layer' },
            { orientation: 'horizontal', position: 72, source: 'layer' },
        ])
    })

    it('水平轴命中拖动盒上/中/下缘；命中轴保留来源供吸附线区分', () => {
        const axes: SnapAxis[] = [{ orientation: 'horizontal', position: 73, source: 'guide' }]
        // y 点 50/70/90：73 距中点 70 → dy = +3
        const r = resolveSnap(box(0, 50, 100, 40), axes, 5)
        expect(r.dy).toBe(3)
        expect(r.dx).toBe(0)
        expect(r.axes).toEqual([{ orientation: 'horizontal', position: 73, source: 'guide' }])
    })
})
