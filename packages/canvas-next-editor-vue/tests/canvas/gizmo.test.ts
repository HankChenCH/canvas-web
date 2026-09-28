import { describe, expect, it } from 'vitest'

import { EditorSession, type FrameScheduler, type OverlayPaintArgs } from '@hankchen/canvas-next-editor'

import { createGizmoOverlayPainter } from '../../src/canvas/gizmo'

const nullScheduler: FrameScheduler = () => () => {}

/** 纯对象 ctx 替身：记录关键笔画调用与线宽（node 环境无 canvas） */
function mockCtx() {
    const calls: string[] = []
    const lineWidths: number[] = []
    return {
        calls,
        lineWidths,
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
        set lineWidth(v: number) {
            lineWidths.push(v)
        },
    } as unknown as CanvasRenderingContext2D & { calls: string[]; lineWidths: number[] }
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

describe('createGizmoOverlayPainter（gizmo 覆盖层画笔：选择框 + hover）', () => {
    it('清屏（设备空间）→ 施加与内容层一致的 dpr×zoom×相机变换 → 画选中盒', () => {
        session.setSelection(['layers', 0])
        session.setHovered(null)
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })

        expect(ctx.calls[0]).toBe('transform:1,0,0,1,0,0') // 复位到设备空间
        expect(ctx.calls[1]).toBe('clear:0,0,600,400')
        // scale = dpr*zoom = 4；平移 = -cam*scale
        expect(ctx.calls[2]).toBe('transform:4,0,0,4,-40,-80')
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50'])
        expect(ctx.lineWidths).toEqual([1]) // 2 css px / zoom 2 = 1 场景单位
    })

    it('hover 高亮先画且更细，选中框后画压上', () => {
        session.setSelection(['layers', 0])
        session.setHovered(['layers', 1])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })
        expect(strokes(ctx)).toEqual(['stroke:300,200,100,50', 'stroke:100,200,100,50'])
        expect(ctx.lineWidths).toEqual([0.5, 1]) // hover 1 css px、selection 2 css px（/zoom）
    })

    it('hover 与选中同层时只画选中框', () => {
        session.setSelection(['layers', 0])
        session.setHovered(['layers', 0])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50'])
    })

    it('无选择/无悬停只清屏；无文档只清屏', () => {
        session.setSelection(null)
        session.setHovered(null)
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args })
        expect(strokes(ctx)).toHaveLength(0)
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
        expect(strokes(ctx2)).toEqual(['stroke:100,200,100,50'])
        session.setSelection(null)
    })

    it('隐藏层 gizmo 过滤（工单 10）：隐藏层上的悬停框同样不画，可见选中照画', () => {
        session.setSelection(['layers', 0])
        session.setHovered(['layers', 1])
        session.toggleLayerVisibility(['layers', 1])
        const ctx = mockCtx()
        createGizmoOverlayPainter(session, ctx)({ ...args, doc: session.store.doc })
        expect(strokes(ctx)).toEqual(['stroke:100,200,100,50']) // 只剩选中框
        session.toggleLayerVisibility(['layers', 1])
        session.setSelection(null)
        session.setHovered(null)
    })
})
