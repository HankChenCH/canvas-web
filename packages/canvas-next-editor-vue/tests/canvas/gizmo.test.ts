import { describe, expect, it } from 'vitest'

import { EditorSession, type FrameScheduler, type OverlayPaintArgs } from '@hankchen/canvas-next-editor'

import { createGizmoOverlayPainter } from '../../src/canvas/gizmo'

const nullScheduler: FrameScheduler = () => () => {}

/** 纯对象 ctx 替身：记录关键笔画调用与线宽（node 环境无 canvas） */
function mockCtx() {
    const calls: string[] = []
    const lineWidths: number[] = []
    const fills: string[] = []
    return {
        calls,
        lineWidths,
        fills,
        canvas: { width: 600, height: 400 },
        setTransform(...args: number[]) {
            calls.push(`transform:${args.join(',')}`)
        },
        clearRect(...args: number[]) {
            calls.push(`clear:${args.join(',')}`)
        },
        strokeRect(...args: number[]) {
            calls.push(`stroke:${args.join(',')}`)
        },
        fillRect(...args: number[]) {
            fills.push(`fill:${args.join(',')}`)
            calls.push(`fill:${args.join(',')}`)
        },
        set lineWidth(v: number) {
            lineWidths.push(v)
        },
    } as unknown as CanvasRenderingContext2D & { calls: string[]; lineWidths: number[]; fills: string[] }
}

/** 双层最小文档：layer0 (100,200) 100×50、layer1 (300,200) 100×50 */
const layer = (x: number) => ({
    type: 'TextLayer' as const,
    name: '',
    visible: true,
    priority: 10,
    shape: {
        width: 100,
        height: 50,
        autoWidth: false,
        autoHeight: false,
        lineHeight: 1.2,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        border: { top: null, bottom: null, left: null, right: null },
        backgroundColor: null,
    },
    align: { horizontal: 'left' as const, vertical: 'top' as const },
    position: { anchor: 'top-left' as const, x, y: 200 },
    text: 'hi',
    expression: null,
    font: '',
    fontSize: 16,
    fontColor: '#000000',
    angle: 0,
    autowrap: false,
})

const session = new EditorSession({ scheduleFrame: nullScheduler })
session.openDocument({ width: 2400, height: 1500, layers: [layer(100), layer(300)] })

const args: OverlayPaintArgs = {
    viewport: { x: 10, y: 20, zoom: 2 },
    dpr: 2,
    doc: session.store.doc,
}

const strokes = (ctx: { calls: string[] }) => ctx.calls.filter((c) => c.startsWith('stroke'))

/**
 * 八柄绘制断言（工单 07）：盒 (100,200) 100×50 的柄中心 = 四角 + 四边中点
 * （nw(100,200) n(150,200) ne(200,200) e(200,225) se(200,250) s(150,250)
 * sw(100,250) w(100,225)），柄边长 = 8 css px / zoom 2 = 4 场景单位；
 * strokes() 只含 strokeRect（fill 另断言），次序 = RESIZE_HANDLES 先 fill 后
 * stroke，strokes[0] 恒为选中框。
 */
const HANDLES_ZOOM2 = [
    'stroke:98,198,4,4', // nw (100,200)
    'stroke:148,198,4,4', // n (150,200)
    'stroke:198,198,4,4', // ne (200,200)
    'stroke:198,223,4,4', // e (200,225)
    'stroke:198,248,4,4', // se (200,250)
    'stroke:148,248,4,4', // s (150,250)
    'stroke:98,248,4,4', // sw (100,250)
    'stroke:98,223,4,4', // w (100,225)
] as const

const FILLS_ZOOM2 = [
    'fill:98,198,4,4',
    'fill:148,198,4,4',
    'fill:198,198,4,4',
    'fill:198,223,4,4',
    'fill:198,248,4,4',
    'fill:148,248,4,4',
    'fill:98,248,4,4',
    'fill:98,223,4,4',
] as const

describe('createGizmoOverlayPainter（gizmo 覆盖层画笔：选择框 + hover + 八柄）', () => {
    it('清屏（设备空间）→ 施加与内容层一致的 dpr×zoom×相机变换 → 画选中盒与八柄', () => {
        session.setSelection(['layers', 0])
        session.setHovered(null)
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })

        expect(ctx.calls[0]).toBe('transform:1,0,0,1,0,0') // 复位到设备空间
        expect(ctx.calls[1]).toBe('clear:0,0,600,400')
        // scale = dpr*zoom = 4；平移 = -cam*scale
        expect(ctx.calls[2]).toBe('transform:4,0,0,4,-40,-80')
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50', ...HANDLES_ZOOM2])
        // 选中框 2 css px / zoom 2 = 1 场景单位；八柄线宽同式
        // 选中框 2 css px / zoom 2 = 1 场景单位；八柄线宽循环外设一次（同值）
        expect(ctx.lineWidths).toEqual([1, 1])
        expect(ctx.fills).toEqual([...FILLS_ZOOM2])
    })

    it('hover 高亮先画且更细，选中框后画压上，柄最后', () => {
        session.setSelection(['layers', 0])
        session.setHovered(['layers', 1])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })
        expect(strokes(ctx)).toEqual([
            'stroke:300,200,100,50',
            'stroke:100,200,100,50',
            ...HANDLES_ZOOM2,
        ])
        expect(ctx.lineWidths).toEqual([0.5, 1, 1]) // hover 1 css px、selection/柄 2 css px（/zoom）
    })

    it('hover 与选中同层时只画选中框与柄', () => {
        session.setSelection(['layers', 0])
        session.setHovered(['layers', 0])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50', ...HANDLES_ZOOM2])
    })

    it('无选择/无悬停只清屏；无文档只清屏', () => {
        session.setSelection(null)
        session.setHovered(null)
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })
        expect(strokes(ctx)).toHaveLength(0)
        expect(ctx.fills).toHaveLength(0)
        expect(ctx.calls[1]).toBe('clear:0,0,600,400')

        const ctx2 = mockCtx()
        createGizmoOverlayPainter(session, ctx2)({ ...args, doc: null })
        expect(ctx2.calls).toEqual(['transform:1,0,0,1,0,0', 'clear:0,0,600,400', 'transform:4,0,0,4,-40,-80'])
    })

    it('隐藏层 gizmo 过滤（工单 10）：选中/悬停落在 hidden 根层不画框', () => {
        session.setHovered(null)
        session.setSelection(['layers', 0])
        session.toggleLayerVisibility(['layers', 0])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args, doc: session.store.doc })
        expect(strokes(ctx)).toEqual([]) // 选中框被过滤，其余照旧（清屏 + 变换）

        // 恢复可见即恢复选中框
        session.toggleLayerVisibility(['layers', 0])
        const ctx2 = mockCtx()
        createGizmoOverlayPainter(session, ctx2)({ ...args, doc: session.store.doc })
        expect(strokes(ctx2)).toEqual(['stroke:100,200,100,50', ...HANDLES_ZOOM2])
        session.setSelection(null)
    })

    it('隐藏层 gizmo 过滤（工单 10）：隐藏层上的悬停框同样不画，可见选中照画', () => {
        session.setSelection(['layers', 0])
        session.setHovered(['layers', 1])
        session.toggleLayerVisibility(['layers', 1])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args, doc: session.store.doc })
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50', ...HANDLES_ZOOM2]) // 只剩选中框与柄
        session.toggleLayerVisibility(['layers', 1])
        session.setSelection(null)
        session.setHovered(null)
    })

    it('锁定 gizmo 锁样式（canvas-web-layer-lock 工单 02）：锁定选中层只画选中框（可定位、不可变换——有框无柄）', () => {
        session.setHovered(null)
        session.setSelection(['layers', 0])
        session.toggleLayerLock(['layers', 0])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args, doc: session.store.doc })
        // 框照画（锁定 ≠ 隐藏——「可定位」的镜像）；柄面折叠（内核 resizeHandlesAt
        // 对锁定子树返回空集）——「不可变换」的镜像，工单 03 目验「有框无柄」
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50'])
        expect(ctx.fills).toHaveLength(0)
        expect(ctx.lineWidths).toEqual([1]) // 选中框线宽语义不变
        session.toggleLayerLock(['layers', 0])
        session.setSelection(null)
    })

    it('锁定层上的 hover 残留不画高亮（锁定先于 hover：ui 态残留兜底，与 hidden 过滤同缝）', () => {
        session.setSelection(['layers', 0])
        session.setHovered(['layers', 1])
        session.toggleLayerLock(['layers', 1]) // hover 已设上再锁定——残留态
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args, doc: session.store.doc })
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50', ...HANDLES_ZOOM2]) // 只剩选中框与柄
        session.toggleLayerLock(['layers', 1])
        session.setHovered(null)
        session.setSelection(null)
    })
})
