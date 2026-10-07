/**
 * 八柄缩放手势（工单 07）：beginResize/resizeTo/endResize 会话 API。
 *
 * - 几何：对缘固定、minSize 钳位不翻转（spatial/resize 纯函数，见其测试）；
 * - 写回：目标盒反解 position（锚点偏移随新尺寸重算）+ 尺寸字段写入，写后经
 *   renormalize + canonicalize 表格强同步（updateSpec 同门）；
 * - auto 采纳（工单验收项 2）：被拖轴带 autoWidth/autoHeight 标志时，首个位移
 *   事务把解析尺寸落地为声明值并清标志（改尺寸标志语义，不冻结非拖轴）；
 * - 吸附（工单验收项 3）：移动缘对吸附轴求位（拖动同一条轴集合缝），修正并入
 *   同一 mergeKey 事务，命中轴回写 ui.snapAxes 供吸附线呈现；
 * - 历史：一次手势的全部位移并成一步（mergeKey 'resize'），undo 一次回手势前。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph, type Canvas, type Layer, type LayerBox, type TableLayer } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { cellLayer, imageLayer, qrLayer, rowLayer, shapeWire, tableLayer, textLayer, wireNode } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const docWith = (...layers: Layer[]): Canvas => ({ width: 800, height: 600, layers })

const makeSession = (layers: Layer[]): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(docWith(...layers))
    return session
}

describe('beginResize：守卫', () => {
    it('未打开文档 / 路径不可解析：拒绝', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        expect(session.beginResize(['layers', 0], 'se', 0, 0)).toBe(false)
        session.openDocument(docWith(textLayer()))
        expect(session.beginResize(['layers', 9], 'se', 0, 0)).toBe(false)
    })

    it('锁定子树：拒绝（与拖动起点同一 isLocked 门）', () => {
        const session = makeSession([textLayer()])
        session.toggleLayerLock(['layers', 0])
        expect(session.beginResize(['layers', 0], 'se', 0, 0)).toBe(false)
    })

    it('角色不可缩放轴：行上拒绝横向柄、放行纵向柄', () => {
        const session = makeSession([tableLayer([rowLayer([cellLayer(textLayer({ priority: 10 }))])])])
        expect(session.beginResize(['layers', 0, 'rows', 0], 'e', 0, 0)).toBe(false)
        expect(session.beginResize(['layers', 0, 'rows', 0], 's', 0, 0)).toBe(true)
    })

    it('拖动会话进行中拒绝开缩放；缩放会话进行中拒绝开拖动', () => {
        const session = makeSession([textLayer()])
        expect(session.beginDrag(['layers', 0], 0, 0)).toBe(true)
        expect(session.beginResize(['layers', 0], 'se', 0, 0)).toBe(false)
        session.endDrag()
        expect(session.beginResize(['layers', 0], 'se', 0, 0)).toBe(true)
        expect(session.beginDrag(['layers', 0], 0, 0)).toBe(false)
        session.endResize()
        expect(session.beginDrag(['layers', 0], 0, 0)).toBe(true)
    })

    it('会话态住 ui 分支：beginResize 记录路径/柄/起点/起始盒，不进历史', () => {
        const session = makeSession([textLayer()])
        expect(session.beginResize(['layers', 0], 'se', 5, 6)).toBe(true)
        const gesture = session.store.ui.resize
        expect(gesture).not.toBeNull()
        expect(gesture!.path).toEqual(['layers', 0])
        expect(gesture!.handle).toBe('se')
        expect(gesture!.startScene).toEqual({ x: 5, y: 6 })
        expect(gesture!.startBox).toMatchObject({ x: 0, y: 0, width: 100, height: 50 })
        expect(session.store.history).toHaveLength(0)
    })
})

describe('resizeHandleAt：会话级柄命中查询', () => {
    it('选中框柄面命中（半径屏幕 6px 折算）；非选中态返回 null', () => {
        const session = makeSession([textLayer({ shape: { width: 200, height: 120 } })])
        session.setSelection(['layers', 0])
        expect(session.resizeHandleAt(200, 120)).toBe('se') // se 柄中心 (200,120)
        expect(session.resizeHandleAt(400, 400)).toBeNull()
        session.setSelection(null)
        expect(session.resizeHandleAt(200, 120)).toBeNull()
    })
})

describe('resizeTo：根层写回（position 反解 + 尺寸落地）', () => {
    it('e 柄：宽随位移，左缘不动（top-left 锚 position.x 不变）', () => {
        const session = makeSession([textLayer()])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(30, 0) // dx = 30 → 宽 130
        const layer = session.store.doc!.layers[0]!
        expect(layer.shape.width).toBe(130)
        expect(layer.position).toMatchObject({ x: 0, y: 0 })
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 0, width: 130, height: 50 })
    })

    it('w 柄：左缘随位移、右缘固定（position.x 补偿锚点）', () => {
        const session = makeSession([textLayer({ position: { anchor: 'top-left', x: 100, y: 40 } })])
        session.beginResize(['layers', 0], 'w', 100, 40)
        session.resizeTo(140, 40) // 左缘 100 → 140，右缘 200 固定 → 宽 60
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 140, y: 40, width: 60, height: 50 })
    })

    it('n 柄：上缘随位移、下缘固定', () => {
        const session = makeSession([textLayer({ position: { anchor: 'top-left', x: 0, y: 100 } })])
        session.beginResize(['layers', 0], 'n', 0, 100)
        session.resizeTo(0, 120) // 上缘 100 → 120，下缘 150 固定 → 高 30
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 120, height: 30 })
    })

    it('center 锚角柄：盒左/上缘固定、尺寸增大，position 反解吸收锚点偏移变化', () => {
        const session = makeSession([
            imageLayer({ position: { anchor: 'center', x: 0, y: 0 }, shape: { width: 100, height: 50 } }),
        ])
        // center 锚：盒 = ((800−100)/2, (600−50)/2) = (350, 275)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 350, y: 275, width: 100, height: 50 })
        session.beginResize(['layers', 0], 'se', 0, 0)
        session.resizeTo(50, 25)
        const box: LayerBox | null = session.layerBoxAt(['layers', 0])
        expect(box).toMatchObject({ x: 350, y: 275, width: 150, height: 75 })
    })

    it('minSize 钳位透传：e 柄拖过对缘停在 1px、不翻转', () => {
        const session = makeSession([textLayer()])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(-500, 0)
        const layer = session.store.doc!.layers[0]!
        expect(layer.shape.width).toBe(1)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, width: 1 })
    })
})

describe('resizeTo：auto 标志采纳（工单验收项 2）', () => {
    it('autoWidth 文本层拖 e 柄：解析宽落地为声明宽、标志关闭', () => {
        const session = makeSession([textLayer({ shape: { autoWidth: true, width: 0 } })])
        const startBox = session.layerBoxAt(['layers', 0])!
        expect(startBox.width).toBeGreaterThan(0) // 自然宽在盒上生效
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(50, 0) // dx = 50 → 宽 = 自然宽 + 50
        const layer = session.store.doc!.layers[0]!
        expect(layer.shape.autoWidth).toBe(false)
        expect(layer.shape.width).toBe(startBox.width + 50)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ width: startBox.width + 50 })
    })

    it('autoWidth 文本层拖 s 柄：宽轴未被拖，标志保持、自然宽不冻结', () => {
        const session = makeSession([textLayer({ shape: { autoWidth: true, width: 0 } })])
        session.beginResize(['layers', 0], 's', 0, 0)
        session.resizeTo(0, 50) // dy = 50 → 高 = 50 + 50 = 100
        const layer = session.store.doc!.layers[0]!
        expect(layer.shape.autoWidth).toBe(true)
        expect(layer.shape.height).toBe(100)
    })

    it('autoHeight 文本层拖 s 柄：解析高落地为声明高、标志关闭，undo 一次双还原', () => {
        const session = makeSession([textLayer({ shape: { autoHeight: true, height: 0 }, autowrap: true })])
        const startBox = session.layerBoxAt(['layers', 0])!
        session.beginResize(['layers', 0], 's', 0, 0)
        session.resizeTo(0, 30) // dy = 30 → 高 = 解析高 + 30
        const layer = session.store.doc!.layers[0]!
        expect(layer.shape.autoHeight).toBe(false)
        expect(layer.shape.height).toBe(startBox.height + 30)
        session.undo()
        const restored = session.store.doc!.layers[0]!
        expect(restored.shape.autoHeight).toBe(true)
        expect(restored.shape.height).toBe(0)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ height: startBox.height })
    })

    it('QR 纵轴 auto：拖 e 柄只写宽，高随宽保持正方形（从动轴不采纳不吸附）', () => {
        const session = makeSession([qrLayer({ shape: { width: 80, height: 0, autoHeight: true } })])
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ width: 80, height: 80 })
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(40, 0) // dx = 40 → 宽 120
        const layer = session.store.doc!.layers[0]!
        expect(layer.shape.autoHeight).toBe(true) // 从动轴标志不动
        expect(layer.shape.width).toBe(120)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 0, width: 120, height: 120 })
    })
})

describe('resizeTo：吸附（工单验收项 3）', () => {
    /** 吸附源（盒 100,100 起 100×50）+ 缩放层（盒 0,0 起 100×50） */
    const makePairSession = (): EditorSession =>
        makeSession([
            textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } }),
            textLayer({ priority: 10 }),
        ])

    it('e 柄右缘拖近源层右缘：宽被修正吸到同缘，命中轴回显', () => {
        const session = makePairSession()
        session.beginResize(['layers', 1], 'e', 0, 0)
        session.resizeTo(120, 0) // 右缘暂定 220，距源右缘 200 在阈值外 → 不吸
        expect(session.store.doc!.layers[1]!.shape.width).toBe(220)
        expect(session.listSnapAxes()).toEqual([])
        session.resizeTo(102, 0) // 右缘暂定 202，距 200 在阈值 6 内 → 修正 −2
        expect(session.store.doc!.layers[1]!.shape.width).toBe(200)
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 200, source: 'layer' }])
    })

    it('吸附只修正被拖缘：w 柄左缘吸到源层右缘，右缘严格不动', () => {
        const session = makeSession([
            textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } }),
            textLayer({ priority: 10, position: { anchor: 'top-left', x: 195, y: 0 } }),
        ])
        session.beginResize(['layers', 1], 'w', 195, 0) // 起点取左缘场景 x
        session.resizeTo(198, 0) // 左缘暂定 198，距源右缘 200 在阈值内 → 修正 +2
        const layer = session.store.doc!.layers[1]!
        expect(layer.shape.width).toBe(95)
        expect(session.layerBoxAt(['layers', 1])).toMatchObject({ x: 200, width: 95 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 200, source: 'layer' }])
    })

    it('屏幕 6px 阈值按缩放换算：zoom=2 时场景阈值收紧到 3', () => {
        const session = makePairSession()
        session.store.setViewport({ x: 0, y: 0, zoom: 2 })
        session.beginResize(['layers', 1], 'e', 0, 0)
        session.resizeTo(104, 0) // 右缘 204，场景距 4 > 3 → 不吸
        expect(session.store.doc!.layers[1]!.shape.width).toBe(204)
        session.resizeTo(102, 0) // 右缘 202，场景距 2 ≤ 3 → 吸
        expect(session.store.doc!.layers[1]!.shape.width).toBe(200)
    })

    it('endResize 清命中轴并闭合合并（同键后续事务另起一步）', () => {
        const session = makePairSession()
        session.beginResize(['layers', 1], 'e', 0, 0)
        session.resizeTo(102, 0)
        session.endResize()
        expect(session.listSnapAxes()).toEqual([])
        expect(session.store.ui.resize).toBeNull()
        expect(session.store.history[0]!.mergeKey).toBeNull()
    })
})

describe('resizeTo：历史合并（工单验收项 4 的合步同门）', () => {
    it('一次手势的全部位移并成一步，undo 一次回手势前', () => {
        const session = makeSession([textLayer()])
        session.beginResize(['layers', 0], 'se', 0, 0)
        session.resizeTo(110, 60)
        session.resizeTo(120, 70)
        session.resizeTo(130, 80)
        expect(session.store.history).toHaveLength(1)
        session.endResize()
        session.undo()
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 100, height: 50 })
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 0 })
    })

    it('缩放会话进行中微调空转（防插入事务拆分开放中的合并步）', () => {
        const session = makeSession([textLayer()])
        session.setSelection(['layers', 0])
        session.beginResize(['layers', 0], 'se', 0, 0)
        expect(session.nudge(1, 1)).toBe(false)
        session.endResize()
        expect(session.nudge(1, 1)).toBe(true)
    })
})

describe('resizeTo：表格强同步（updateSpec 同门）', () => {
    it('根表 e 柄改宽：行宽随表宽同步', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ priority: 10 })), cellLayer(textLayer({ priority: 10 }))])]),
        ])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(50, 0) // dx = 50 → 表宽 150
        const table = session.store.doc!.layers[0] as TableLayer
        expect(table.shape.width).toBe(150)
        for (const row of table.rows) {
            expect(row.shape.width).toBe(150)
        }
    })

    it('行 s 柄收缩到最高格以下：行高被「行高取最高格」不变量顶回', () => {
        const session = makeSession([
            tableLayer([rowLayer([cellLayer(textLayer({ priority: 10, shape: { height: 50 } }))])]),
        ])
        session.beginResize(['layers', 0, 'rows', 0], 's', 0, 0)
        session.resizeTo(0, -30) // 想缩到 20 < 格高 50
        const row = (session.store.doc!.layers[0] as TableLayer).rows[0]!
        expect(row.shape.height).toBe(50)
    })
})

describe('resizeTo：嵌套路径写回（position 反解须减父级原点）', () => {
    /**
     * 模板表置于非零原点 (100,80)：表 320×120，模板行 320×60，两格 160×60，
     * 格 0 带文本内容（160×20）。position 反解的坐标面基准——盒对 position 线性
     * （box = 父级原点 + 锚点偏移 + position），嵌套路径的父级原点非零，绝对
     * 目标盒坐标不得直写相对 position。
     */
    const templateLayersAtOrigin = (): Layer[] =>
        decodeGraph({
            canvas: { width: 800, height: 600 },
            layers: [
                wireNode('TableLayer', shapeWire(320, 120), {
                    priority: 10,
                    data: { rowsPath: 'order.items' },
                    template: wireNode('TableRowTemplate', shapeWire(320, 60), {
                        cells: [
                            wireNode('TableCellLayer', shapeWire(160, 60), {
                                content: wireNode('TextLayer', shapeWire(160, 20), {}),
                            }),
                            wireNode('TableCellLayer', shapeWire(160, 60), { content: null }),
                        ],
                    }),
                }, { position: { x: 100, y: 80, position: 'top-left' } }),
            ],
        }).layers.slice()

    it('模板格内容 s 柄增高：position 保持格内相对值、盒顶缘固定', () => {
        const session = makeSession(templateLayersAtOrigin())
        const path = ['layers', 0, 'template', 'cells', 0, 'content'] as const
        expect(session.layerBoxAt(path)).toMatchObject({ x: 100, y: 80, width: 160, height: 20 })
        session.beginResize(path, 's', 180, 100)
        session.resizeTo(180, 130) // dy = 30 → 高 50
        const table = session.store.doc!.layers[0] as unknown as {
            template: { cells: { content: { position: { x: number; y: number }; shape: { height: number } } }[] }
        }
        expect(table.template.cells[0]!.content!.position).toEqual({ anchor: 'top-left', x: 0, y: 0 })
        expect(table.template.cells[0]!.content!.shape.height).toBe(50)
        expect(session.layerBoxAt(path)).toMatchObject({ x: 100, y: 80, width: 160, height: 50 })
    })

    it('模板格 e 柄增宽：格 position 不被污染、内容宽随格同步', () => {
        const session = makeSession(templateLayersAtOrigin())
        const path = ['layers', 0, 'template', 'cells', 0] as const
        expect(session.layerBoxAt(path)).toMatchObject({ x: 100, y: 80, width: 160, height: 60 })
        session.beginResize(path, 'e', 260, 110)
        session.resizeTo(300, 110) // dx = 40 → 格宽 200
        const table = session.store.doc!.layers[0] as unknown as {
            template: {
                cells: { position: { x: number; y: number }; shape: { width: number }; content: { shape: { width: number } } | null }[]
            }
        }
        expect(table.template.cells[0]!.position).toEqual({ anchor: 'top-left', x: 0, y: 0 })
        expect(table.template.cells[0]!.shape.width).toBe(200)
        expect(table.template.cells[0]!.content!.shape.width).toBe(200)
        expect(session.layerBoxAt(path)).toMatchObject({ x: 100, y: 80, width: 200, height: 60 })
    })

    it('V1 行 s 柄增高（表在非零原点、非首行）：行 position 保持零、盒顶缘固定', () => {
        const session = makeSession([
            tableLayer(
                [
                    rowLayer([cellLayer(textLayer({ priority: 10 }))], { shape: { height: 60 } }),
                    rowLayer([cellLayer(textLayer({ priority: 10 }))], { shape: { height: 60 } }),
                ],
                { position: { anchor: 'top-left', x: 100, y: 80 } },
            ),
        ])
        const path = ['layers', 0, 'rows', 1] as const
        expect(session.layerBoxAt(path)).toMatchObject({ x: 100, y: 140, width: 100, height: 60 })
        session.beginResize(path, 's', 150, 200)
        session.resizeTo(150, 230) // dy = 30 → 高 90
        const row = (session.store.doc!.layers[0] as TableLayer).rows[1]!
        expect(row.position).toEqual({ anchor: 'top-left', x: 0, y: 0 })
        expect(session.layerBoxAt(path)).toMatchObject({ x: 100, y: 140, width: 100, height: 90 })
    })
})
