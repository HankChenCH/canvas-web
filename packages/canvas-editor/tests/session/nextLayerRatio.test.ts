/**
 * 建层比例槽与比例预设（canvas-web-image-ratio-preset 工单 01，spec 决策 1-5）：
 * - 槽住 store ui 分支（编辑器级偏好，per-模板随 prefs 跨会话持久）：初始 'free'、
 *   openDocument 不重置（nextTextStyle 同门）、值等短路、不进历史；
 * - 预设 = 写槽的快捷方式：armLayerCreate('ImageLayer', preset) 命中六档（含
 *   'free' 显式重置）即写槽再武装；未知 id 跳写槽武装照常；文本预设互不干扰；
 * - 消费：createTo 按槽钳橡皮筋（Shift 瞬时反转槽态，逐帧求位不写槽）；
 *   endCreate 死区点击按槽派生缺省盒（长边 200 定短边，忽略 shift）；仅图片层
 *   消费（QR 恒方是层型硬约束）；
 * - resizeTo Shift 等比：参照当前盒宽高比、角/边柄驱动轴、零维盒与非图片层
 *   空转、最小钳位随动、吸附只在驱动轴移动缘；
 * - prefs 读写对：getEditorPrefs 带出、applyEditorPrefs 宽容读（非六档回落
 *   'free'，未知键忽略）；全程 graph 往返零 diff、槽不进历史。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph, encodeGraph, type Canvas, type ImageLayer, type Layer } from '@hankchen/canvas'

import {
    defaultNextLayerRatio,
    defaultSizeForRatio,
    pickNextLayerRatio,
    RATIO_PRESETS,
    ratioValue,
} from '../../src/editing/layerPanel'
import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { imageLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const docWith = (...layers: Layer[]): Canvas => ({ width: 800, height: 600, layers })

const makeSession = (layers: Layer[] = []): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(docWith(...layers))
    return session
}

describe('槽初值与 store 语义', () => {
    it('槽初始 = defaultNextLayerRatio() = free', () => {
        const session = makeSession()
        expect(session.store.ui.nextLayerRatio).toBe('free')
        expect(session.store.ui.nextLayerRatio).toBe(defaultNextLayerRatio())
    })

    it('setNextLayerRatio 写槽并通知 nextLayerRatio 分支；值等短路零通知', () => {
        const session = makeSession()
        let notified = 0
        const unsubscribe = session.subscribe((change) => {
            if (change.scope === 'ui' && change.branch === 'nextLayerRatio') notified += 1
        })
        session.store.setNextLayerRatio('3:4')
        expect(session.store.ui.nextLayerRatio).toBe('3:4')
        expect(notified).toBe(1)
        session.store.setNextLayerRatio('3:4')
        expect(notified).toBe(1)
        unsubscribe()
    })

    it('openDocument 换文档不清槽（偏好内核自持，nextTextStyle 同门）', () => {
        const session = makeSession([textLayer()])
        session.store.setNextLayerRatio('9:16')
        session.openDocument(docWith())
        expect(session.store.ui.nextLayerRatio).toBe('9:16')
    })

    it('槽写不进历史（ui 分支，undo/redo 栈零增长、patch 无 nextLayerRatio 键）', () => {
        const session = makeSession([imageLayer()])
        const before = session.store.history.length
        session.store.setNextLayerRatio('1:1')
        expect(session.store.history.length).toBe(before)
        expect(
            session.store.history.some((step) => step.patches.some((p) => p.path.includes('nextLayerRatio'))),
        ).toBe(false)
    })
})

describe('预设常量与纯函数（editing/layerPanel）', () => {
    it('RATIO_PRESETS 六档固定清单（free + 五个具名比）', () => {
        expect(RATIO_PRESETS.map((preset) => preset.id)).toEqual(['free', '1:1', '4:3', '3:4', '16:9', '9:16'])
    })

    it('ratioValue：free → null（不钳），具名档 → 有理数 {w, h}', () => {
        expect(ratioValue('free')).toBeNull()
        expect(ratioValue('1:1')).toEqual({ w: 1, h: 1 })
        expect(ratioValue('4:3')).toEqual({ w: 4, h: 3 })
        expect(ratioValue('3:4')).toEqual({ w: 3, h: 4 })
        expect(ratioValue('16:9')).toEqual({ w: 16, h: 9 })
        expect(ratioValue('9:16')).toEqual({ w: 9, h: 16 })
    })

    it('pickNextLayerRatio 宽容读：六档原样收，其余回落 free（非对象/越表值）', () => {
        expect(pickNextLayerRatio('free')).toBe('free')
        expect(pickNextLayerRatio('16:9')).toBe('16:9')
        expect(pickNextLayerRatio('2:3')).toBe('free')
        expect(pickNextLayerRatio(undefined)).toBe('free')
        expect(pickNextLayerRatio(null)).toBe('free')
        expect(pickNextLayerRatio(42)).toBe('free')
    })

    it('defaultSizeForRatio 死区派生：长边 200 定短边（round half-up）', () => {
        expect(defaultSizeForRatio({ w: 16, h: 9 })).toEqual({ width: 200, height: 113 }) // round(112.5)
        expect(defaultSizeForRatio({ w: 4, h: 3 })).toEqual({ width: 200, height: 150 })
        expect(defaultSizeForRatio({ w: 3, h: 4 })).toEqual({ width: 150, height: 200 })
        expect(defaultSizeForRatio({ w: 9, h: 16 })).toEqual({ width: 113, height: 200 })
        expect(defaultSizeForRatio({ w: 1, h: 1 })).toEqual({ width: 200, height: 200 })
    })
})

describe('armLayerCreate 扩展：比例预设写槽再武装', () => {
    it('六档命中即写槽再武装（含 free 显式重置入口）', () => {
        const session = makeSession()
        for (const preset of RATIO_PRESETS) {
            session.armLayerCreate('ImageLayer', preset.id)
            expect(session.store.ui.nextLayerRatio).toBe(preset.id)
            expect(session.store.ui.armedCreate).toBe('ImageLayer')
            session.cancelArmLayerCreate()
        }
    })

    it('未知 id 跳写槽、武装照常（text-defaults 同门）', () => {
        const session = makeSession()
        session.store.setNextLayerRatio('4:3')
        session.armLayerCreate('ImageLayer', 'nope' as never)
        expect(session.store.ui.nextLayerRatio).toBe('4:3')
        expect(session.store.ui.armedCreate).toBe('ImageLayer')
    })

    it('文本/比例预设互不干扰：图片层带文本预设不写两槽、文本层带比例档不写文本槽', () => {
        const session = makeSession([textLayer()])
        session.store.setNextLayerRatio('16:9')
        session.armLayerCreate('ImageLayer', 'heading') // heading 是文本档、非比例档
        expect(session.store.ui.nextLayerRatio).toBe('16:9')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(24)
        expect(session.store.ui.armedCreate).toBe('ImageLayer')
        session.cancelArmLayerCreate()

        session.armLayerCreate('TextLayer', '1:1' as never) // 1:1 是比例档、非文本档
        expect(session.store.ui.nextTextStyle.fontSize).toBe(24)
        expect(session.store.ui.armedCreate).toBe('TextLayer')
        session.cancelArmLayerCreate()

        session.armLayerCreate('TextLayer', 'heading') // 文本预设照常写文本槽
        expect(session.store.ui.nextTextStyle.fontSize).toBe(40)
        expect(session.store.ui.nextLayerRatio).toBe('16:9')
    })
})

describe('createTo：按槽钳制橡皮筋（仅图片层）', () => {
    it('槽 16:9：拖 200×10 → 长轴驱动钳 200×113', () => {
        const session = makeSession()
        session.store.setNextLayerRatio('16:9')
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(200, 10)
        expect(session.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 200, height: 113 })
    })

    it('槽 free：自由钳现状（height = |dy| 原样）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(200, 10)
        expect(session.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 200, height: 10 })
    })

    it('Shift 瞬时反转：槽 1:1 按 Shift = 临时自由、槽 free 按 Shift = 临时钳 1:1', () => {
        const slotted = makeSession()
        slotted.store.setNextLayerRatio('1:1')
        slotted.armLayerCreate('ImageLayer')
        slotted.beginLayerCreate(0, 0)
        slotted.createTo(120, 90, true) // 槽非自由按 Shift = 自由钳
        expect(slotted.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 90 })
        slotted.createTo(120, 90) // 松开还原槽钳
        expect(slotted.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 120 })

        const free = makeSession()
        free.armLayerCreate('ImageLayer')
        free.beginLayerCreate(0, 0)
        free.createTo(120, 90, true) // 槽自由按 Shift = 钳 1:1（宽驱动）
        expect(free.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 120 })
    })

    it('Shift 反转逐帧求位、不写槽（槽值原样）', () => {
        const session = makeSession()
        session.store.setNextLayerRatio('4:3')
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(120, 90, true)
        expect(session.store.ui.nextLayerRatio).toBe('4:3')
        session.endCreate()
        expect(session.store.ui.nextLayerRatio).toBe('4:3')
    })

    it('其余层型不消费槽且 Shift 无效果：TextLayer 自由（含按 Shift）、QR 恒方语义不动', () => {
        const text = makeSession()
        text.store.setNextLayerRatio('1:1')
        text.armLayerCreate('TextLayer')
        text.beginLayerCreate(0, 0)
        text.createTo(120, 90)
        expect(text.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 90 })
        text.createTo(120, 90, true) // Shift 对非图片层无效果（不被反转成钳 1:1）
        expect(text.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 90 })

        const qr = makeSession()
        qr.store.setNextLayerRatio('3:4')
        qr.armLayerCreate('QrCodeLayer')
        qr.beginLayerCreate(100, 100)
        qr.createTo(180, 140, true)
        expect(qr.store.ui.create!.rect).toEqual({ x: 100, y: 100, width: 80, height: 80 })
    })
})

describe('endCreate：死区点击缺省盒按槽派生（忽略 shift）', () => {
    const clickWithSlot = (slot: Parameters<EditorSession['store']['setNextLayerRatio']>[0], shift = false): ImageLayer => {
        const session = makeSession()
        session.store.setNextLayerRatio(slot)
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(40, 40)
        session.createTo(42, 43, shift) // 死区内 → 点击兜底
        session.endCreate()
        return session.store.doc!.layers[0] as ImageLayer
    }

    it('五比例派生：16:9→200×113、4:3→200×150、3:4→150×200、9:16→113×200、1:1→200×200', () => {
        expect(clickWithSlot('16:9').shape).toMatchObject({ width: 200, height: 113 })
        expect(clickWithSlot('4:3').shape).toMatchObject({ width: 200, height: 150 })
        expect(clickWithSlot('3:4').shape).toMatchObject({ width: 150, height: 200 })
        expect(clickWithSlot('9:16').shape).toMatchObject({ width: 113, height: 200 })
        expect(clickWithSlot('1:1').shape).toMatchObject({ width: 200, height: 200 })
    })

    it('free = 200×150 现状（工厂缺省不动）', () => {
        expect(clickWithSlot('free').shape).toMatchObject({ width: 200, height: 150 })
    })

    it('忽略 shift：shift 拖入死区仍按槽派生（非反转 1:1、非橡皮筋 rect）', () => {
        const layer = clickWithSlot('16:9', true)
        expect(layer.shape).toMatchObject({ width: 200, height: 113 })
        expect(layer.position).toMatchObject({ x: 40, y: 40 })
    })

    it('其余层型点击保持工厂缺省：QR 120×120、Text 200×60（槽不越层型）', () => {
        const session = makeSession()
        session.store.setNextLayerRatio('1:1')
        session.armLayerCreate('QrCodeLayer')
        session.beginLayerCreate(40, 40)
        session.createTo(42, 43)
        session.endCreate()
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 120, height: 120 })

        const text = makeSession()
        text.store.setNextLayerRatio('1:1')
        text.armLayerCreate('TextLayer')
        text.beginLayerCreate(40, 40)
        text.createTo(42, 43)
        text.endCreate()
        expect(text.store.doc!.layers[0]!.shape).toMatchObject({ width: 200, height: 60 })
    })

    it('死区外落库取手势末态钳制结果（含 Shift 反转末态）', () => {
        const session = makeSession()
        session.store.setNextLayerRatio('free')
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(220, 190, true) // 槽自由 + Shift = 钳 1:1
        session.endCreate()
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 220, height: 220 })
    })
})

describe('resizeTo Shift 等比（仅图片层）', () => {
    it('e 柄：宽驱动、高按当前盒比例派生（100×50 拖 30 → 130×65）', () => {
        const session = makeSession([imageLayer()])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(30, 999, true)
        const layer = session.store.doc!.layers[0] as ImageLayer
        expect(layer.shape).toMatchObject({ width: 130, height: 65 })
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 0, y: 0, width: 130, height: 65 })
    })

    it('s 柄：高驱动、宽派生（100×50 拖 20 → 140×70）', () => {
        const session = makeSession([imageLayer()])
        session.beginResize(['layers', 0], 's', 0, 0)
        session.resizeTo(999, 20, true)
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 140, height: 70 })
    })

    it('角柄驱动轴 = 位移较大轴：2:1 盒 dx=40 dy=10 宽驱动、dx=10 dy=40 高驱动', () => {
        const session = makeSession([imageLayer({ shape: { width: 200, height: 100 } })])
        session.beginResize(['layers', 0], 'se', 0, 0)
        session.resizeTo(40, 10, true) // 宽驱动：宽 240、高 round(240×100/200)=120
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 240, height: 120 })
        session.endResize()

        const other = makeSession([imageLayer({ shape: { width: 200, height: 100 } })])
        other.beginResize(['layers', 0], 'se', 0, 0)
        other.resizeTo(10, 40, true) // 高驱动：高 140、宽 round(140×2)=280
        expect(other.store.doc!.layers[0]!.shape).toMatchObject({ width: 280, height: 140 })
    })

    it('w/n 柄对缘固定：尺寸派生同门、x/y 随新尺寸回推', () => {
        const session = makeSession([imageLayer({ position: { anchor: 'top-left', x: 100, y: 40 } })])
        session.beginResize(['layers', 0], 'w', 100, 40)
        session.resizeTo(140, 40, true) // 左缘 100→140、右缘 200 固定 → 宽 60、高 30
        expect(session.layerBoxAt(['layers', 0])).toMatchObject({ x: 140, y: 40, width: 60, height: 30 })
    })

    it('参照当前盒实际比例：改过的 2:1 盒 Shift 缩放保持 2:1（非工厂 4:3）', () => {
        const session = makeSession([imageLayer({ shape: { width: 200, height: 100 } })])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(60, 0, true) // 宽 260 → 高 130
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 260, height: 130 })
    })

    it('零维盒 Shift 空转：回落自由缩放（未拖轴零接触）', () => {
        const session = makeSession([imageLayer({ shape: { width: 0, height: 0 } })])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(130, 999, true)
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 130, height: 0 })
    })

    it('非图片层 Shift 空转：TextLayer 自由缩放现状（宽 130 高 80 不派生）', () => {
        const session = makeSession([textLayer({ shape: { width: 100, height: 80 } })])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(30, 0, true)
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 130, height: 80 })
    })

    it('不按 Shift 的图片层缩放照旧自由（shift 缺省 false）', () => {
        const session = makeSession([imageLayer({ shape: { width: 100, height: 50 } })])
        session.beginResize(['layers', 0], 'e', 0, 0)
        session.resizeTo(30, 999)
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 130, height: 50 })
    })

    it('最小钳位随动：驱动轴钳到 1 后派生轴按钳后驱动维跟随', () => {
        const session = makeSession([imageLayer({ shape: { width: 100, height: 100 } })])
        session.beginResize(['layers', 0], 'se', 0, 0)
        session.resizeTo(-300, -1000, true) // 高驱动 raw < 0 → 钳 1，宽 = 1
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 1, height: 1 })
    })

    it('吸附只在驱动轴移动缘：垂直缘命中平移不破比例；派生底缘贴轴不吸', () => {
        // 源层右缘 435（垂直轴）：e 柄拖动缘 440 吸到 435 → dx 修正 −5 → 宽 135、高 68（round(67.5) half-up）
        const snapped = makeSession([
            textLayer({ priority: 20, position: { anchor: 'top-left', x: 335, y: 0 } }),
            imageLayer({ priority: 30, position: { anchor: 'top-left', x: 300, y: 300 } }),
        ])
        snapped.beginResize(['layers', 1], 'e', 400, 325)
        snapped.resizeTo(440, 360, true)
        expect(snapped.store.doc!.layers[1]!.shape).toMatchObject({ width: 135, height: 68 })
        expect(snapped.listSnapAxes()).toEqual([{ orientation: 'vertical', position: 435, source: 'layer' }])

        // 源层底缘 370 = 派生底缘落点：派生轴不独立吸附 → 高恰 70、无水平命中轴
        const derived = makeSession([
            textLayer({ priority: 20, shape: { width: 100, height: 100 }, position: { anchor: 'top-left', x: 0, y: 270 } }),
            imageLayer({ priority: 30, position: { anchor: 'top-left', x: 300, y: 300 } }),
        ])
        derived.beginResize(['layers', 1], 'e', 400, 325)
        derived.resizeTo(440, 360, true)
        expect(derived.store.doc!.layers[1]!.shape).toMatchObject({ width: 140, height: 70 })
        expect(derived.listSnapAxes()).toEqual([])
    })
})

describe('prefs 读写对（宽容读回落 free）', () => {
    it('getEditorPrefs 带出槽；applyEditorPrefs 全法形状恢复', () => {
        const session = makeSession([imageLayer()])
        session.store.setNextLayerRatio('16:9')
        const prefs = session.getEditorPrefs()
        expect(prefs.nextLayerRatio).toBe('16:9')

        const other = makeSession()
        other.applyEditorPrefs(prefs)
        expect(other.store.ui.nextLayerRatio).toBe('16:9')
    })

    it('宽容读：非六档枚举值回落 free、未知键忽略、旧快照缺字段回落 free', () => {
        const session = makeSession()
        session.store.setNextLayerRatio('9:16')
        session.applyEditorPrefs({
            rulersVisible: true,
            anchorExpanded: false,
            nextTextStyle: session.store.ui.nextTextStyle,
            nextLayerRatio: '2:3' as never,
        })
        expect(session.store.ui.nextLayerRatio).toBe('free')

        session.applyEditorPrefs({
            rulersVisible: true,
            anchorExpanded: false,
            nextTextStyle: session.store.ui.nextTextStyle,
            nextLayerRatio: '4:3',
            junk: 1,
        } as never)
        expect(session.store.ui.nextLayerRatio).toBe('4:3')

        session.applyEditorPrefs({
            rulersVisible: true,
            anchorExpanded: false,
            nextTextStyle: session.store.ui.nextTextStyle,
        } as never)
        expect(session.store.ui.nextLayerRatio).toBe('free')
    })
})

describe('graph 往返零 diff（槽与钳制不触 wire 面）', () => {
    it('比例钳建层 + Shift 等比缩放后的 encode→decode→encode 恒等；槽不在文档 patch 里', () => {
        const session = makeSession([imageLayer()])
        session.store.setNextLayerRatio('16:9')
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(100, 100)
        session.createTo(300, 110)
        session.endCreate()
        session.beginResize(['layers', 1], 'se', 300, 113)
        session.resizeTo(360, 130, true)
        session.endResize()

        const first = encodeGraph(session.store.doc!)
        const second = encodeGraph(decodeGraph(JSON.parse(JSON.stringify(first))))
        expect(second).toEqual(first)
    })
})
