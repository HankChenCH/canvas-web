/**
 * findHighlight 覆盖层画笔测试（canvas-web-find-replace 工单 03，spec 决策 6）：
 * - 查找会话关闭不画（closeFind 后高亮即撤，open 是画的门）；
 * - 开会话逐命中画轮廓框：盒经内核 layerBoxAt 解析（模板子树路径经预览视图，
 *   内核 boxByPath 同源），隐藏层命中照画（隐藏是渲染排除语义非保护语义——
 *   spec 决策 1，与 gizmo 的 hidden 过滤刻意分立）；
 * - 当前命中 accent 强调（加粗 + 淡填充），非当前单轮廓，线宽按 zoom 折算
 *   （屏幕观感恒定，gizmo 同门）；
 * - 无命中/无文档不画。
 */
import { describe, expect, it } from 'vitest'

import {
    EditorSession,
    type FrameScheduler,
    type OverlayPaintArgs,
    type Canvas,
} from '@hankchen/canvas-editor'

import { drawFindMatches } from '../../src/canvas/findHighlight'
import {
    cellLayer,
    rowTemplateLayer,
    tableLayer,
    textLayer,
} from '../../../canvas-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

interface PaintOp {
    kind: 'fill' | 'stroke'
    rect: string
    style: string
    /** stroke 专有：调用时点的线宽（fill 为 null） */
    lineWidth: number | null
}

/** 纯对象 ctx 替身：记录 fill/stroke 矩形、样式与线宽（node 环境无 canvas） */
function mockCtx() {
    const ops: PaintOp[] = []
    let lineWidth = 0
    let fillStyle = ''
    let strokeStyle = ''
    return {
        ops,
        canvas: { width: 600, height: 400 },
        set fillStyle(v: string) {
            fillStyle = v
        },
        get fillStyle() {
            return fillStyle
        },
        set strokeStyle(v: string) {
            strokeStyle = v
        },
        get strokeStyle() {
            return strokeStyle
        },
        set lineWidth(v: number) {
            lineWidth = v
        },
        get lineWidth() {
            return lineWidth
        },
        fillRect(x: number, y: number, w: number, h: number) {
            ops.push({ kind: 'fill', rect: `${x},${y},${w},${h}`, style: fillStyle, lineWidth: null })
        },
        strokeRect(x: number, y: number, w: number, h: number) {
            ops.push({ kind: 'stroke', rect: `${x},${y},${w},${h}`, style: strokeStyle, lineWidth })
        },
    } as unknown as CanvasRenderingContext2D & { ops: PaintOp[] }
}

const doc = (layers: Canvas['layers']): Canvas => ({ width: 800, height: 600, layers })

const makeEditor = (layers: Canvas['layers']): EditorSession => {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument(doc(layers))
    return editor
}

/** 双层夹具：layer0 (100,0) '2026 春季'、layer1 (300,0) '春季班'——查询「春季」
 *  视觉序命中 [layer1, layer0]（数组尾→头） */
const twoHitLayers = (): Canvas['layers'] => [
    textLayer({ text: '2026 春季', position: { x: 100 } }),
    textLayer({ text: '春季班', position: { x: 300 } }),
]

const argsFor = (editor: EditorSession): OverlayPaintArgs => ({
    viewport: { x: 10, y: 20, zoom: 2 },
    dpr: 2,
    doc: editor.store.doc,
})

const strokes = (ops: PaintOp[]) => ops.filter((op) => op.kind === 'stroke')

describe('drawFindMatches：画的门', () => {
    it('查找会话关闭不画（closeFind 后高亮即撤）；开会话 query 未写入同样不画', () => {
        const editor = makeEditor(twoHitLayers())
        const closed = mockCtx()
        drawFindMatches(closed, editor, argsFor(editor))
        expect(closed.ops).toHaveLength(0)

        editor.beginFind()
        const emptyQuery = mockCtx()
        drawFindMatches(emptyQuery, editor, argsFor(editor))
        expect(emptyQuery.ops).toHaveLength(0)
    })

    it('无命中不画；无文档不画', () => {
        const editor = makeEditor(twoHitLayers())
        editor.beginFind()
        editor.setFindQuery('不存在')

        const noMatch = mockCtx()
        drawFindMatches(noMatch, editor, argsFor(editor))
        expect(noMatch.ops).toHaveLength(0)

        const bare = new EditorSession({ scheduleFrame: nullScheduler })
        bare.beginFind()
        const noDoc = mockCtx()
        drawFindMatches(noDoc, bare, { viewport: { x: 0, y: 0, zoom: 1 }, dpr: 1, doc: null })
        expect(noDoc.ops).toHaveLength(0)
    })
})

describe('drawFindMatches：逐命中轮廓 + 当前强调', () => {
    it('两命中两轮廓，视觉序；当前命中（游标 0）淡填充 + accent 加粗，非当前单轮廓', () => {
        const editor = makeEditor(twoHitLayers())
        editor.beginFind()
        editor.setFindQuery('春季')

        const ctx = mockCtx()
        drawFindMatches(ctx, editor, argsFor(editor))

        // 命中序 = 视觉序（数组尾→头）：先 layer1 (300,0) 后 layer0 (100,0)
        expect(ctx.ops.map((op) => op.kind)).toEqual(['fill', 'stroke', 'stroke'])
        expect(ctx.ops[0]).toMatchObject({ rect: '300,0,100,50', style: 'rgba(56, 189, 248, 0.12)' })
        expect(ctx.ops[1]).toMatchObject({ rect: '300,0,100,50', style: '#38bdf8', lineWidth: 1.5 })
        expect(ctx.ops[2]).toMatchObject({ rect: '100,0,100,50', style: '#f59e0b', lineWidth: 1 })
    })

    it('游标随导航切换：游标 1 时强调落在第二命中（盒与序随派生列表）', () => {
        const editor = makeEditor(twoHitLayers())
        editor.beginFind()
        editor.setFindQuery('春季')
        editor.setFindCursor(1)

        const ctx = mockCtx()
        drawFindMatches(ctx, editor, argsFor(editor))
        expect(ctx.ops.map((op) => op.kind)).toEqual(['stroke', 'fill', 'stroke'])
        expect(ctx.ops[0]).toMatchObject({ rect: '300,0,100,50', style: '#f59e0b', lineWidth: 1 })
        expect(ctx.ops[1]).toMatchObject({ rect: '100,0,100,50', style: 'rgba(56, 189, 248, 0.12)' })
        expect(ctx.ops[2]).toMatchObject({ rect: '100,0,100,50', style: '#38bdf8', lineWidth: 1.5 })
    })

    it('线宽按 zoom 折算（css 像素屏幕观感恒定）：zoom 1 时 2 / 3', () => {
        const editor = makeEditor(twoHitLayers())
        editor.beginFind()
        editor.setFindQuery('春季')

        const ctx = mockCtx()
        drawFindMatches(ctx, editor, { viewport: { x: 0, y: 0, zoom: 1 }, dpr: 1, doc: editor.store.doc })
        expect(strokes(ctx.ops).map((op) => op.lineWidth)).toEqual([3, 2])
    })
})

describe('drawFindMatches：对象面边界（spec 决策 1）', () => {
    it('隐藏层命中照画（隐藏是渲染排除语义非保护语义——与 gizmo 的 hidden 过滤分立）', () => {
        const editor = makeEditor(twoHitLayers())
        editor.beginFind()
        editor.setFindQuery('春季')
        editor.toggleLayerVisibility(['layers', 1]) // 视觉首命中层隐藏

        const ctx = mockCtx()
        drawFindMatches(ctx, editor, argsFor(editor))
        expect(ctx.ops.map((op) => op.kind)).toEqual(['fill', 'stroke', 'stroke'])
    })

    it('模板子树命中照画：盒经预览视图解析（内核 boxByPath 同源）', () => {
        const editor = makeEditor([
            tableLayer([], {
                rowsPath: 'data.rows',
                shape: { width: 320, height: 120 },
                template: rowTemplateLayer([cellLayer(textLayer({ text: '春季' }))]),
            }),
        ])
        editor.beginFind()
        editor.setFindQuery('春季')

        const ctx = mockCtx()
        drawFindMatches(ctx, editor, argsFor(editor))
        // 命中路径含 template 段——盒从预览视图解析成功才有笔画
        const hitPath = ['layers', 0, 'template', 'cells', 0, 'content'] as const
        const box = editor.layerBoxAt(hitPath)
        expect(box).not.toBeNull()
        expect(ctx.ops.map((op) => op.kind)).toEqual(['fill', 'stroke'])
        expect(ctx.ops[1]).toMatchObject({ rect: `${box!.x},${box!.y},${box!.width},${box!.height}` })
    })
})
