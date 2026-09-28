import { describe, expect, it, vi } from 'vitest'

import type { Canvas } from '@hankchen/canvas-next'

import type { FrameScheduler, OverlayPainter } from '../../src/session/editor'
import { EditorSession } from '../../src/session/editor'
import { cellLayer, imageLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

/** 手动帧调度器（同 editor.test.ts）：捕获回调，测试里手动 flush */
function manualScheduler(): FrameScheduler & { flush: () => void } {
    let queued: (() => void) | null = null
    return Object.assign(
        (cb: () => void) => {
            queued = cb
            return () => {
                queued = null
            }
        },
        {
            flush() {
                const cb = queued
                queued = null
                cb?.()
            },
        },
    )
}

const makeSession = (layers: Canvas['layers']) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 2400, height: 1500, layers })
    return session
}

const baseDoc = () => [
    textLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
    textLayer({ position: { anchor: 'top-left', x: 50, y: 0 }, shape: { width: 100, height: 100 } }),
]

/** 表 (96,1120)：一行两格 300 宽，首格含内容层 */
const tableDoc = () => [
    tableLayer(
        [
            rowLayer(
                [
                    cellLayer(
                        textLayer({ shape: { width: 100, height: 40 }, position: { anchor: 'top-left', x: 5, y: 5 } }),
                        { shape: { width: 300, height: 90 } },
                    ),
                    cellLayer(null, { shape: { width: 300, height: 90 } }),
                ],
                { shape: { width: 600, height: 90 } },
            ),
        ],
        { shape: { width: 600, height: 90 }, position: { anchor: 'top-left', x: 96, y: 1120 } },
    ),
]

describe('命中与选择（ui 分支，画布与后续面板同源）', () => {
    it('toScenePoint：屏幕 → 场景（拖动的 zoom 折算入口）', () => {
        const session = makeSession(baseDoc())
        session.store.setViewport({ x: 100, y: 50, zoom: 2 })
        expect(session.toScenePoint(20, 40)).toEqual({ x: 110, y: 70 })
    })

    it('selectAt 命中最上层并写入 ui.selection；点空处清空选择', () => {
        const session = makeSession(baseDoc())
        expect(session.selectAt(75, 50)).toEqual(['layers', 1])
        expect(session.store.ui.selection).toEqual(['layers', 1])
        expect(session.selectAt(200, 50)).toBeNull()
        expect(session.store.ui.selection).toBeNull()
    })

    it('hoverAt 同一命中源；setHovered 供绑定层清空（指针离场）', () => {
        const session = makeSession(baseDoc())
        session.hoverAt(25, 50)
        expect(session.store.ui.hovered).toEqual(['layers', 0])
        session.hoverAt(200, 50)
        expect(session.store.ui.hovered).toBeNull()
        session.hoverAt(25, 50)
        session.setHovered(null)
        expect(session.store.ui.hovered).toBeNull()
    })

    it('escapeSelection：未选择时 no-op；根层选择 Esc 即清空', () => {
        const session = makeSession(baseDoc())
        session.escapeSelection()
        expect(session.store.ui.selection).toBeNull()
        session.selectAt(25, 50)
        session.escapeSelection()
        expect(session.store.ui.selection).toBeNull()
    })

    it('表格级联：点格选中格，Escape 逐级升级 row→table→清空', () => {
        const session = makeSession(tableDoc())
        session.selectAt(150, 1140) // 格内容层
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 0, 'content'])

        session.selectAt(350, 1180) // 格空白处
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 0])

        session.escapeSelection()
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0])
        session.escapeSelection()
        expect(session.store.ui.selection).toEqual(['layers', 0])
        session.escapeSelection()
        expect(session.store.ui.selection).toBeNull()
    })
})

describe('底图豁免（工票 16）：面板路径语义不经画布命中，不受影响', () => {
    /** 全幅底图（数组头）+ 叠在其上的普通层 */
    const fullBleedDoc = () => [
        imageLayer({ shape: { width: 2400, height: 1500 } }),
        textLayer({ position: { anchor: 'top-left', x: 100, y: 100 }, shape: { width: 100, height: 100 } }),
    ]

    it('hoverAt 在全幅底图上为 null（豁免经 hitTest 一条缝自动生效）', () => {
        const session = makeSession(fullBleedDoc())
        session.hoverAt(1200, 1000)
        expect(session.store.ui.hovered).toBeNull()
        session.hoverAt(150, 150)
        expect(session.store.ui.hovered).toEqual(['layers', 1])
    })

    it('setSelection 底图路径照常选中；拖动改位一步历史可撤销', () => {
        const session = makeSession(fullBleedDoc())
        session.setSelection(['layers', 0])
        expect(session.store.ui.selection).toEqual(['layers', 0])

        expect(session.beginDrag(['layers', 0], 1200, 1000)).toBe(true)
        session.dragTo(1300, 1050)
        session.endDrag()
        const layer = session.store.doc!.layers[0]!
        expect(layer.position.x).toBe(100)
        expect(layer.position.y).toBe(50)
        expect(session.store.history).toHaveLength(1)

        session.undo()
        expect(session.store.doc!.layers[0]!.position.x).toBe(0)
    })
})

describe('拖动：九锚点一视同仁（锚点不动、x/y 增量）', () => {
    const ANCHORS = [
        'top-left', 'top', 'top-right',
        'left', 'center', 'right',
        'bottom-left', 'bottom', 'bottom-right',
    ] as const

    it('九种锚点下同一位移得到相同的 x/y 增量，锚点字段不变', () => {
        for (const anchor of ANCHORS) {
            const session = makeSession([
                textLayer({ position: { anchor, x: 100, y: 60 }, shape: { width: 80, height: 40 } }),
            ])
            // 直接按路径选中拖动（不依赖点击点，锚点解析后的盒位置各不相同）
            session.setSelection(['layers', 0])
            expect(session.beginDrag(['layers', 0], 120, 70)).toBe(true)
            session.dragTo(220, 120) // 场景位移 (+100, +50)

            const layer = session.store.doc!.layers[0]!
            expect(layer.position.anchor).toBe(anchor)
            expect(layer.position.x).toBe(200)
            expect(layer.position.y).toBe(110)

            session.endDrag()
        }
    })

    it('zoom 在 toScenePoint 折算：zoom=2 时屏幕 +40 = 场景 +20', () => {
        const session = makeSession([
            textLayer({ position: { anchor: 'top-left', x: 10, y: 10 } }),
        ])
        session.store.setViewport({ x: 0, y: 0, zoom: 2 })
        session.setSelection(['layers', 0])

        const start = session.toScenePoint(20, 20)
        session.beginDrag(['layers', 0], start.x, start.y)
        const to = session.toScenePoint(60, 20) // 屏幕 +40 → 场景 +20
        session.dragTo(to.x, to.y)
        session.endDrag()

        expect(session.store.doc!.layers[0]!.position.x).toBe(30)
    })

    it('一次拖动多步 dragTo 只记一步历史（mergeKey 合并），endDrag 闭合', () => {
        const session = makeSession([
            textLayer({ position: { anchor: 'top-left', x: 10, y: 10 } }),
        ])
        const path = session.selectAt(20, 20)!
        session.beginDrag(path, 20, 20)
        session.dragTo(30, 30)
        session.dragTo(45, 25)
        session.dragTo(60, 40)

        expect(session.store.history).toHaveLength(1)
        session.endDrag()
        expect(session.store.ui.drag).toBeNull()
        expect(session.store.history[0]!.mergeKey).toBeNull()

        // 闭合后新拖动开新步
        session.beginDrag(path, 60, 40)
        session.dragTo(80, 40)
        session.endDrag()
        expect(session.store.history).toHaveLength(2)
    })

    it('拖动只写 position x/y（拖动会话不污染文档其它字段），patch path 前缀 = 拖动路径', () => {
        const session = makeSession([
            textLayer({ position: { anchor: 'top-left', x: 10, y: 10 }, fontSize: 16 }),
        ])
        const path = session.selectAt(20, 20)!
        session.beginDrag(path, 20, 20)
        session.dragTo(50, 35)
        session.endDrag()

        const changes: { scope: string; patches?: { path: PropertyKey[] }[] }[] = []
        session.subscribe((c) => {
            if (c.scope === 'doc') changes.push(c)
        })
        session.beginDrag(path, 50, 35)
        session.dragTo(70, 35)
        session.endDrag()

        const docChange = changes[0]!
        expect(docChange.patches!.map((p) => p.path)).toEqual([
            ['layers', 0, 'position', 'x'],
        ])
        // 位置外的字段原封不动
        const layer = session.store.doc!.layers[0]!
        expect(layer.type).toBe('TextLayer')
        if (layer.type === 'TextLayer') expect(layer.fontSize).toBe(16)
        expect(layer.priority).toBe(10)
    })

    it('零位移拖动不产生历史步；未 begin 的 dragTo/endDrag 空转', () => {
        const session = makeSession([
            textLayer({ position: { anchor: 'top-left', x: 10, y: 10 } }),
        ])
        const path = session.selectAt(20, 20)!

        session.dragTo(50, 50) // 未 begin
        session.endDrag()
        expect(session.store.history).toHaveLength(0)

        session.beginDrag(path, 20, 20)
        expect(session.beginDrag(path, 20, 20)).toBe(false) // 已在拖动中
        session.endDrag() // 无 dragTo：无事务可记
        expect(session.store.history).toHaveLength(0)
        expect(session.store.ui.drag).toBeNull()

        session.beginDrag(path, 20, 20)
        session.dragTo(20, 20) // 位移为零：immer 无变化 → 空转
        session.endDrag()
        expect(session.store.history).toHaveLength(0)
    })

    it('beginDrag 拒绝不存在的路径', () => {
        const session = makeSession(baseDoc())
        expect(session.beginDrag(['layers', 9], 0, 0)).toBe(false)
        expect(session.store.ui.drag).toBeNull()
    })
})

describe('fitToSelection（自适应选区视图）', () => {
    it('有选择时视口适配选中盒（盒中心落在视口中心）', () => {
        const session = makeSession([
            textLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
        ])
        session.setSurfaceSize(400, 400)
        session.selectAt(50, 50)
        session.fitToSelection()

        const viewport = session.store.ui.viewport
        expect(viewport.zoom).toBeCloseTo(4, 10) // 400/100
        const scene = session.toScenePoint(200, 200)
        expect(scene.x).toBeCloseTo(50, 8)
        expect(scene.y).toBeCloseTo(50, 8)
    })

    it('表格嵌套选择适配该子层自身的盒', () => {
        const session = makeSession(tableDoc())
        session.setSurfaceSize(600, 300)
        session.selectAt(150, 1140) // 格内容层 100×40 @ (101,1125)
        session.fitToSelection()

        const scene = session.toScenePoint(300, 150)
        expect(scene.x).toBeCloseTo(151, 6)
        expect(scene.y).toBeCloseTo(1145, 6)
    })

    it('无选择时回落适应画布', () => {
        const session = makeSession([
            textLayer({ position: { anchor: 'top-left', x: 0, y: 0 }, shape: { width: 100, height: 100 } }),
        ])
        session.setSurfaceSize(1200, 750)
        session.fitToSelection()
        expect(session.store.ui.viewport.zoom).toBeCloseTo(0.5, 12)
    })
})

describe('store 变更 → 分层脏标：选择/悬停/拖动只脏覆盖层', () => {
    it('selection/hovered/drag 分支不触发内容层重绘', () => {
        let begins = 0
        const backend = {
            begin() {
                begins += 1
            },
            end() {},
            drawRect() {},
            drawImage() {},
            drawText() {},
        }
        const scheduler = manualScheduler()
        const painter = vi.fn<OverlayPainter>()
        const session = new EditorSession({ scheduleFrame: scheduler })
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument({ width: 100, height: 80, layers: baseDoc() })
        scheduler.flush() // 组装期脏标先落一帧，与断言隔开
        begins = 0
        painter.mockClear()

        session.selectAt(75, 50)
        session.hoverAt(25, 50)
        session.setHovered(null)
        const path = session.store.ui.selection!
        session.beginDrag(path, 75, 50)
        session.endDrag()
        scheduler.flush()
        expect(begins).toBe(0) // 内容层零重绘
        expect(painter).toHaveBeenCalledTimes(1) // 全部脏标合帧后只重绘一次覆盖层
    })

    it('拖动位移写文档 → 双层重绘', () => {
        let begins = 0
        const backend = {
            begin() {
                begins += 1
            },
            end() {},
            drawRect() {},
            drawImage() {},
            drawText() {},
        }
        const scheduler = manualScheduler()
        const painter = vi.fn<OverlayPainter>()
        const session = new EditorSession({ scheduleFrame: scheduler })
        session.attachContentBackend(backend)
        session.setOverlayPainter(painter)
        session.openDocument({ width: 100, height: 80, layers: baseDoc() })
        scheduler.flush()
        begins = 0
        painter.mockClear()

        const path = session.selectAt(75, 50)!
        session.beginDrag(path, 75, 50)
        session.dragTo(90, 50) // 文档事务：内容层必须重绘
        session.endDrag()
        scheduler.flush()
        expect(begins).toBe(1)
    })
})
