/**
 * 画拉建层会话（drag-create 工单 01，spec 决策 2/3/4/5/6）：
 * - 武装态（armedCreate）+ 橡皮筋会话住 ui 分支：拖拽期文档零变更（纯视觉）；
 * - endCreate 单事务落库（缺省形态 + position/shape 写入 + 置顶插入）+ 自动选中
 *   + 解除武装；一次手势 = 一步历史，undo 整体回退；
 * - 死区分流：位移小于阈值 = 点击兜底（缺省尺寸、左上角对准点击点），阈值屏幕
 *   px、zoom 折算同 SNAP_THRESHOLD_SCREEN_PX 口径；
 * - 吸附：缘位点进既有 resolveSnapPoints 缝，命中轴回写 ui.snapAxes 同门回显；
 * - cancelCreate 零副作用零历史；未武装空转防御；手势互斥（drag/resize 同门）。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas, Layer, TableLayer, TextLayer } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { qrLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const docWith = (...layers: Layer[]): Canvas => ({ width: 800, height: 600, layers })

const makeSession = (layers: Layer[]): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(docWith(...layers))
    return session
}

describe('武装态（armLayerCreate / cancelArmLayerCreate）', () => {
    it('armLayerCreate 置 ui 分支武装层型，cancelArmLayerCreate 解除', () => {
        const session = makeSession([])
        expect(session.store.ui.armedCreate).toBeNull()
        session.armLayerCreate('QrCodeLayer')
        expect(session.store.ui.armedCreate).toBe('QrCodeLayer')
        session.cancelArmLayerCreate()
        expect(session.store.ui.armedCreate).toBeNull()
    })

    it('重复武装同一层型值等短路（不惊动订阅方）', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        let notified = 0
        const unsubscribe = session.subscribe((change) => {
            if (change.scope === 'ui' && change.branch === 'armedCreate') notified += 1
        })
        session.armLayerCreate('TextLayer')
        expect(notified).toBe(0)
        session.armLayerCreate('ImageLayer')
        expect(notified).toBe(1)
        unsubscribe()
    })

    it('openDocument 重置武装态与进行中会话', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(0, 0)
        session.openDocument(docWith(textLayer()))
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.ui.create).toBeNull()
    })
})

describe('beginLayerCreate：守卫与会话态', () => {
    it('未武装拒绝（空转防御）；武装后开成功并捕获层型', () => {
        const session = makeSession([])
        expect(session.beginLayerCreate(10, 10)).toBe(false)
        session.armLayerCreate('TextLayer')
        expect(session.beginLayerCreate(10, 10)).toBe(true)
        const gesture = session.store.ui.create
        expect(gesture).not.toBeNull()
        expect(gesture!.type).toBe('TextLayer')
        expect(gesture!.startScene).toEqual({ x: 10, y: 10 })
        expect(gesture!.currentScene).toEqual({ x: 10, y: 10 })
        expect(gesture!.rect).toEqual({ x: 10, y: 10, width: 0, height: 0 })
    })

    it('会话态住 ui 分支不进历史；拖拽期文档零变更', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(120, 80)
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc!.layers).toHaveLength(1)
        expect(session.store.doc!.layers[0]!.position).toMatchObject({ x: 0, y: 0 })
    })

    it('手势互斥：create 进行中拒绝 drag/resize，反之亦然', () => {
        const session = makeSession([textLayer()])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(0, 0)
        expect(session.beginDrag(['layers', 0], 0, 0)).toBe(false)
        expect(session.beginResize(['layers', 0], 'se', 0, 0)).toBe(false)
        session.cancelCreate() // Esc 解除武装（一次性待命态，重武装后可再画拉）
        expect(session.beginDrag(['layers', 0], 0, 0)).toBe(true)
        session.endDrag()
        session.armLayerCreate('TextLayer')
        expect(session.beginLayerCreate(0, 0)).toBe(true)
    })
})

describe('createTo：橡皮筋求位', () => {
    it('两点正规化落会话 rect（overlay 直读），反向拖不翻转', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(220, 190)
        session.createTo(100, 100)
        expect(session.store.ui.create!.rect).toEqual({ x: 100, y: 100, width: 120, height: 90 })
    })

    it('QR 拖拽期钳方（高随宽从动）', () => {
        const session = makeSession([])
        session.armLayerCreate('QrCodeLayer')
        session.beginLayerCreate(100, 100)
        session.createTo(180, 140)
        expect(session.store.ui.create!.rect).toEqual({ x: 100, y: 100, width: 80, height: 80 })
    })

    it('贴邻层缘吸附：修正并入 rect，命中轴回写 ui.snapAxes（layer 源）', () => {
        const session = makeSession([textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } })])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(196, 320)
        session.createTo(240, 380) // 左缘 196 距源层右缘 200 为 4 ≤ 6 → 修正 +4
        expect(session.store.ui.create!.rect).toEqual({ x: 200, y: 320, width: 44, height: 60 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 200, source: 'layer' }])
    })

    it('画布中轴吸附（source=canvas-center）', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(396, 100)
        session.createTo(430, 140) // 左缘 396 距垂直中轴 400 为 4
        expect(session.store.ui.create!.rect).toMatchObject({ x: 400, width: 34 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 400, source: 'canvas-center' }])
    })

    it('参考线轴吸附（source=guide）', () => {
        const session = makeSession([])
        session.addGuide({ orientation: 'vertical', position: 500 })
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(496, 50)
        session.createTo(520, 90)
        expect(session.store.ui.create!.rect).toMatchObject({ x: 500 })
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 500, source: 'guide' }])
    })

    it('拖离阈值：命中轴清空（瞬时回显，dragTo 同门）', () => {
        const session = makeSession([textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } })])
        session.armLayerCreate('TextLayer')
        // 起点离全部轴远（固定角缘不长期贴轴）：band 300..344 × 320..380
        session.beginLayerCreate(300, 320)
        session.createTo(344, 380)
        expect(session.listSnapAxes()).toEqual([])
        session.createTo(204, 380) // 自由缘 204 吸到源层右缘 200（阈值内）
        expect(session.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 200, source: 'layer' }])
        session.createTo(250, 380) // band 250..300，全部缘离轴阈值外
        expect(session.listSnapAxes()).toEqual([])
    })

    it('无会话调用空转（未武装/未开始的防御）', () => {
        const session = makeSession([textLayer()])
        session.createTo(100, 100)
        expect(session.store.ui.create).toBeNull()
        expect(session.listSnapAxes()).toEqual([])
    })
})

describe('endCreate：落库（死区外）', () => {
    it('正规化矩形落位：position 左上对准 + shape.width/height 写入，返回新层路径', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(100, 100)
        session.createTo(220, 190)
        const path = session.endCreate()
        expect(path).toEqual(['layers', 0])
        const layer = session.store.doc!.layers[0] as TextLayer
        expect(layer.type).toBe('TextLayer')
        expect(layer.position).toMatchObject({ anchor: 'top-left', x: 100, y: 100 })
        expect(layer.shape.width).toBe(120)
        expect(layer.shape.height).toBe(90)
    })

    it('QR 落库恒方：钳方后的方矩形整体写入（width = height）', () => {
        const session = makeSession([])
        session.armLayerCreate('QrCodeLayer')
        session.beginLayerCreate(100, 100)
        session.createTo(180, 140)
        session.endCreate()
        const layer = session.store.doc!.layers[0]!
        expect(layer.shape.width).toBe(80)
        expect(layer.shape.height).toBe(80)
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 100, y: 100, width: 80, height: 80 })
    })

    it('吸附修正随落库生效：贴邻层缘的矩形按修正后几何落位', () => {
        const session = makeSession([textLayer({ priority: 20, position: { anchor: 'top-left', x: 100, y: 100 } })])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(196, 320)
        session.createTo(240, 380)
        session.endCreate()
        expect(session.layerBoxAt(['layers', 1])).toMatchObject({ x: 200, y: 320, width: 44, height: 60 })
    })

    it('四型缺省形态（点击兜底落缺省尺寸）：文本/图片/二维码/表格', () => {
        const cases: { type: Parameters<EditorSession['armLayerCreate']>[0]; assert: (layer: Layer) => void }[] = [
            {
                type: 'TextLayer',
                assert: (layer) => {
                    expect(layer).toMatchObject({ type: 'TextLayer', text: '文本', fontSize: 24 })
                    expect(layer.shape).toMatchObject({ width: 200, height: 60 })
                },
            },
            {
                type: 'ImageLayer',
                assert: (layer) => {
                    expect(layer).toMatchObject({ type: 'ImageLayer', src: null })
                    expect(layer.shape).toMatchObject({ width: 200, height: 150 })
                },
            },
            {
                type: 'QrCodeLayer',
                assert: (layer) => {
                    expect(layer).toMatchObject({ type: 'QrCodeLayer', value: 'canvas-web' })
                    expect(layer.shape).toMatchObject({ width: 120, height: 120 })
                },
            },
            {
                type: 'TableLayer',
                assert: (layer) => {
                    expect(layer).toMatchObject({ type: 'TableLayer', rowsPath: '', rows: [] })
                    expect(layer.shape).toMatchObject({ width: 400, height: 120 })
                },
            },
        ]
        for (const { type, assert } of cases) {
            const session = makeSession([])
            session.armLayerCreate(type)
            session.beginLayerCreate(40, 40)
            session.createTo(42, 43) // 死区内 → 点击兜底，缺省尺寸原样
            session.endCreate()
            const layer = session.store.doc!.layers[0]!
            assert(layer)
            expect(layer.position).toMatchObject({ x: 40, y: 40 })
        }
    })
})

describe('endCreate：死区分流（点击兜底）', () => {
    it('位移小于死区：缺省尺寸、左上角对准点击点（不落零尺寸层）', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(50, 50)
        session.createTo(52, 53) // 位移 hypot ≈ 3.6 ≤ 4
        const path = session.endCreate()
        expect(path).toEqual(['layers', 0])
        const layer = session.store.doc!.layers[0] as TextLayer
        expect(layer.position).toMatchObject({ x: 50, y: 50 })
        expect(layer.shape).toMatchObject({ width: 200, height: 60 })
    })

    it('死区阈值 zoom 折算：zoom=2 时场景阈值收紧到 2（SNAP_THRESHOLD_SCREEN_PX 口径）', () => {
        const session = makeSession([])
        session.store.setViewport({ x: 0, y: 0, zoom: 2 })
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(50, 50)
        session.createTo(53, 50) // 场景位移 3 > 2 → 死区外，按矩形落库
        session.endCreate()
        expect(session.store.doc!.layers[0]!.shape.width).toBe(3)

        const zoomed = makeSession([])
        zoomed.store.setViewport({ x: 0, y: 0, zoom: 2 })
        zoomed.armLayerCreate('TextLayer')
        zoomed.beginLayerCreate(50, 50)
        zoomed.createTo(52, 50) // 场景位移 2 ≤ 2 → 点击兜底
        zoomed.endCreate()
        expect(zoomed.store.doc!.layers[0]!.shape).toMatchObject({ width: 200, height: 60 })
    })

    it('死区内点击兜底同样自动选中 + 解除武装', () => {
        const session = makeSession([])
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(50, 50)
        session.createTo(51, 50)
        session.endCreate()
        expect(session.store.ui.selection).toEqual(['layers', 0])
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.ui.create).toBeNull()
    })
})

describe('endCreate：置顶 + 自动选中 + 解除武装', () => {
    it('priority 置顶 min−1、push 数组尾（视觉最上层）、自动选中新层、解除武装', () => {
        const session = makeSession([
            textLayer({ priority: 30 }),
            textLayer({ priority: 20 }),
            qrLayer({ priority: 10 }),
        ])
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(100, 100)
        const path = session.endCreate()
        expect(path).toEqual(['layers', 3])
        const doc = session.store.doc!
        expect(doc.layers[3]!.priority).toBe(9)
        expect(doc.layers[3]!.type).toBe('ImageLayer')
        expect(session.store.ui.selection).toEqual(['layers', 3])
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.ui.create).toBeNull()
        expect(session.listSnapAxes()).toEqual([])
    })

    it('空画布置顶 priority = 0', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(50, 50)
        session.endCreate()
        expect(session.store.doc!.layers[0]!.priority).toBe(0)
    })

    it('endCreate 清命中轴回显', () => {
        const session = makeSession([])
        session.addGuide({ orientation: 'vertical', position: 100 })
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(98, 320)
        session.createTo(150, 370) // 左缘 98 距参考线 100 为 2 → 命中
        expect(session.listSnapAxes()).toHaveLength(1)
        session.endCreate()
        expect(session.listSnapAxes()).toEqual([])
    })

    it('无会话 endCreate 空转返回 null（防御）', () => {
        const session = makeSession([textLayer()])
        expect(session.endCreate()).toBeNull()
        expect(session.store.doc!.layers).toHaveLength(1)
    })
})

describe('历史：一次手势 = 一步历史', () => {
    it('多次 createTo 后 endCreate 恰一步；undo 整体回退（落位 + 尺寸 + priority + 插入）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        session.armLayerCreate('TableLayer')
        session.beginLayerCreate(100, 100)
        session.createTo(300, 160)
        session.createTo(500, 220)
        session.endCreate()
        expect(session.store.history).toHaveLength(1)
        expect(session.store.doc!.layers).toHaveLength(2)
        const created = session.store.doc!.layers[1] as TableLayer
        expect(created.priority).toBe(9)
        expect(created.position).toMatchObject({ x: 100, y: 100 })
        expect(created.shape).toMatchObject({ width: 400, height: 120 })

        session.undo()
        const doc = session.store.doc!
        expect(doc.layers).toHaveLength(1)
        expect(doc.layers[0]!.priority).toBe(10)
        expect(session.canUndo).toBe(false)
    })

    it('点击兜底同样一步历史可撤销', () => {
        const session = makeSession([])
        session.armLayerCreate('QrCodeLayer')
        session.beginLayerCreate(30, 30)
        session.createTo(31, 31)
        session.endCreate()
        expect(session.store.history).toHaveLength(1)
        session.undo()
        expect(session.store.doc!.layers).toHaveLength(0)
    })
})

describe('cancelCreate：零副作用零历史', () => {
    it('画拉中取消：文档不动、会话与武装清除、零历史', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        const before = session.store.doc
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(100, 100)
        session.createTo(220, 190)
        session.cancelCreate()
        expect(session.store.doc).toBe(before)
        expect(session.store.doc!.layers).toHaveLength(1)
        expect(session.store.ui.create).toBeNull()
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.history).toHaveLength(0)
        expect(session.canUndo).toBe(false)
    })

    it('未开始画拉时 cancelCreate 仅解除武装（Esc 待命态语义）、幂等', () => {
        const session = makeSession([])
        session.armLayerCreate('TextLayer')
        session.cancelCreate()
        expect(session.store.ui.armedCreate).toBeNull()
        session.cancelCreate()
        expect(session.store.history).toHaveLength(0)
    })
})
