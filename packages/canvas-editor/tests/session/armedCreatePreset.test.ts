/**
 * 建层预设随武装载荷化（canvas-web-preset-submenu 工单 01，ADR 0021，spec 决策 1/2）：
 * - 预设不再写任何偏好槽：armLayerCreate(type, preset) 把档位写进武装载荷
 *   ui.armedCreatePreset（与 armedCreateRowsPath 并列、空值语义沿先例）；普通
 *   武装（无 preset）文本按新层样式槽、图片恒自由；
 * - 载荷生命周期：武装 / 换档更新 / 同档短路 / Esc·取消清载荷 /
 *   beginLayerCreate 捕获进画拉会话 / endCreate 落库一次性消费；
 * - 消费几何：Text 档字号直接生效（不经槽）、Image 档 ratio 钳橡皮筋与死区
 *   缺省盒；Shift 瞬时反转源 = 生效档（载荷档或自由），逐帧求值不落持久态；
 * - prefs 往返：nextLayerRatio 退役（停写停读），旧快照该键宽容忽略；
 *   nextTextStyle 照走。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph, encodeGraph, type Canvas, type ImageLayer, type Layer, type TextLayer } from '@hankchen/canvas'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { imageLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const docWith = (...layers: Layer[]): Canvas => ({ width: 800, height: 600, layers })

const makeSession = (layers: Layer[] = []): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(docWith(...layers))
    return session
}

describe('预设载荷字段（store.ui.armedCreatePreset，沿 armedCreateRowsPath 先例）', () => {
    it('载荷初值空串 = 普通武装语义（无预设）', () => {
        const session = makeSession()
        expect(session.store.ui.armedCreatePreset).toBe('')
    })

    it('setArmedCreate 一体写层型与载荷；解除（null）一律清载荷', () => {
        const session = makeSession()
        session.store.setArmedCreate('ImageLayer', '', '1:1')
        expect(session.store.ui.armedCreate).toBe('ImageLayer')
        expect(session.store.ui.armedCreatePreset).toBe('1:1')
        session.store.setArmedCreate(null)
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.ui.armedCreatePreset).toBe('')
    })

    it('同型同载荷短路零通知；换载荷更新并通知（armedCreate 分支）', () => {
        const session = makeSession()
        session.store.setArmedCreate('ImageLayer', '', '1:1')
        let notified = 0
        const unsubscribe = session.subscribe((change) => {
            if (change.scope === 'ui' && change.branch === 'armedCreate') notified += 1
        })
        session.store.setArmedCreate('ImageLayer', '', '1:1')
        expect(notified).toBe(0)
        session.store.setArmedCreate('ImageLayer', '', '4:3')
        expect(notified).toBe(1)
        expect(session.store.ui.armedCreatePreset).toBe('4:3')
        unsubscribe()
    })

    it('模板表风味载荷与预设载荷互斥：rowsPath 武装不带预设、预设武装不带 rowsPath', () => {
        const session = makeSession()
        session.store.setArmedCreate('ImageLayer', '', '1:1')
        session.armTemplateTableCreate('order.items')
        expect(session.store.ui.armedCreateRowsPath).toBe('order.items')
        expect(session.store.ui.armedCreatePreset).toBe('')
        session.store.setArmedCreate('ImageLayer', '', '4:3')
        expect(session.store.ui.armedCreateRowsPath).toBe('')
        expect(session.store.ui.armedCreatePreset).toBe('4:3')
    })

    it('openDocument 重置武装与载荷（rowsPath 同门）', () => {
        const session = makeSession()
        session.store.setArmedCreate('ImageLayer', '', '16:9')
        session.openDocument(docWith())
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.ui.armedCreatePreset).toBe('')
    })
})

describe('armLayerCreate 预设载荷化（不写槽，ADR 0021）', () => {
    it('文本预设武装：档位入载荷，新层样式槽原样（普通武装语义不被预设染指）', () => {
        const session = makeSession()
        session.armLayerCreate('TextLayer', 'heading')
        expect(session.store.ui.armedCreate).toBe('TextLayer')
        expect(session.store.ui.armedCreatePreset).toBe('heading')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(24) // 槽不动（工厂缺省原样）
    })

    it('比例预设武装：档位入载荷（含 free 档——自由档载荷行为等价自由）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '1:1')
        expect(session.store.ui.armedCreate).toBe('ImageLayer')
        expect(session.store.ui.armedCreatePreset).toBe('1:1')
        session.cancelArmLayerCreate()
        session.armLayerCreate('ImageLayer', 'free')
        expect(session.store.ui.armedCreatePreset).toBe('free')
    })

    it('重复武装换档更新载荷、同档短路零通知', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '1:1')
        let notified = 0
        const unsubscribe = session.subscribe((change) => {
            if (change.scope === 'ui' && change.branch === 'armedCreate') notified += 1
        })
        session.armLayerCreate('ImageLayer', '1:1') // 同档短路
        expect(notified).toBe(0)
        session.armLayerCreate('ImageLayer', '16:9') // 换档更新
        expect(notified).toBe(1)
        expect(session.store.ui.armedCreatePreset).toBe('16:9')
        unsubscribe()
    })

    it('未知 id 不落载荷、武装照常（现有防御面沿袭）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', 'nope' as never)
        expect(session.store.ui.armedCreate).toBe('ImageLayer')
        expect(session.store.ui.armedCreatePreset).toBe('')
        session.cancelArmLayerCreate()
        session.armLayerCreate('TextLayer', 'nope' as never)
        expect(session.store.ui.armedCreate).toBe('TextLayer')
        expect(session.store.ui.armedCreatePreset).toBe('')
    })

    it('交叉类型不落载荷、武装照常：文本层带比例档 / 图片层带文本档', () => {
        const session = makeSession()
        session.armLayerCreate('TextLayer', '1:1' as never)
        expect(session.store.ui.armedCreate).toBe('TextLayer')
        expect(session.store.ui.armedCreatePreset).toBe('')
        session.cancelArmLayerCreate()
        session.armLayerCreate('ImageLayer', 'heading' as never)
        expect(session.store.ui.armedCreate).toBe('ImageLayer')
        expect(session.store.ui.armedCreatePreset).toBe('')
    })

    it('取消武装（cancelArmLayerCreate）清载荷零残留', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '9:16')
        session.cancelArmLayerCreate()
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.ui.armedCreatePreset).toBe('')
    })

    it('预设武装与模板表风味武装互斥载荷（armLayerCreate 路径）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '1:1')
        session.armTemplateTableCreate('order.items')
        expect(session.store.ui.armedCreateRowsPath).toBe('order.items')
        expect(session.store.ui.armedCreatePreset).toBe('')
        session.armLayerCreate('ImageLayer', '4:3')
        expect(session.store.ui.armedCreateRowsPath).toBe('')
        expect(session.store.ui.armedCreatePreset).toBe('4:3')
    })
})

describe('载荷生命周期：捕获 / 一次性消费 / 取消零残留', () => {
    it('beginLayerCreate 捕获预设载荷进画拉会话（templateRowsPath 同门）；普通武装不携带', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '1:1')
        expect(session.beginLayerCreate(10, 10)).toBe(true)
        expect(session.store.ui.create!.preset).toBe('1:1')
        session.cancelCreate()
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(10, 10)
        expect(session.store.ui.create!.preset).toBeUndefined()
    })

    it('endCreate 落库一次性消费：武装与载荷双清（会话定死，武装态清后消费不失效）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '1:1')
        session.beginLayerCreate(0, 0)
        session.createTo(220, 190)
        session.endCreate()
        expect(session.store.ui.armedCreate).toBeNull()
        expect(session.store.ui.armedCreatePreset).toBe('')
        expect(session.store.ui.create).toBeNull()
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 220, height: 220 }) // 档位钳制已落库
    })

    it('Esc 取消（cancelCreate）清武装与载荷零残留：画拉中与待命态双路', () => {
        const drawing = makeSession()
        drawing.armLayerCreate('TextLayer', 'heading')
        drawing.beginLayerCreate(0, 0)
        drawing.createTo(120, 80)
        drawing.cancelCreate()
        expect(drawing.store.ui.armedCreate).toBeNull()
        expect(drawing.store.ui.armedCreatePreset).toBe('')
        expect(drawing.store.ui.create).toBeNull()
        expect(drawing.store.history).toHaveLength(0)

        const idle = makeSession()
        idle.armLayerCreate('TextLayer', 'body')
        idle.cancelCreate()
        expect(idle.store.ui.armedCreate).toBeNull()
        expect(idle.store.ui.armedCreatePreset).toBe('')
    })
})

describe('endCreate 档位消费几何（ADR 0021：不经槽）', () => {
    it('Text 档字号直接生效：死区外落 40 号，属性面板预写槽不被覆盖也不被消费扰动', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['fontSize'], 32) // 属性面板权威写预写槽
        session.armLayerCreate('TextLayer', 'heading')
        session.beginLayerCreate(0, 0)
        session.createTo(220, 190)
        session.endCreate()
        const created = session.store.doc!.layers[1] as TextLayer
        expect(created.fontSize).toBe(40) // 档位字号直接生效
        expect(session.store.ui.nextTextStyle.fontSize).toBe(32) // 槽原样
    })

    it('Text 档字号只覆盖字号：字体/行高等槽外字段仍按新层样式槽', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['font'], 'Noto Sans SC')
        session.updateSpec(['layers', 0], ['shape', 'lineHeight'], 1.5)
        session.armLayerCreate('TextLayer', 'body')
        session.beginLayerCreate(40, 40)
        session.createTo(42, 43) // 死区内
        session.endCreate()
        const created = session.store.doc!.layers[1] as TextLayer
        expect(created.fontSize).toBe(16)
        expect(created.font).toBe('Noto Sans SC')
        expect(created.shape.lineHeight).toBe(1.5)
    })

    it('Image 档死区点击缺省盒按档派生：16:9→200×113、3:4→150×200、1:1→200×200', () => {
        const clickWithPreset = (preset: string): ImageLayer => {
            const session = makeSession()
            session.armLayerCreate('ImageLayer', preset as never)
            session.beginLayerCreate(40, 40)
            session.createTo(42, 43) // 死区内 → 点击兜底
            session.endCreate()
            return session.store.doc!.layers[0] as ImageLayer
        }
        expect(clickWithPreset('16:9').shape).toMatchObject({ width: 200, height: 113 })
        expect(clickWithPreset('3:4').shape).toMatchObject({ width: 150, height: 200 })
        expect(clickWithPreset('1:1').shape).toMatchObject({ width: 200, height: 200 })
        expect(clickWithPreset('16:9').position).toMatchObject({ x: 40, y: 40 })
    })

    it('Image 自由档（free 载荷与无载荷）死区点击 = 工厂缺省 200×150', () => {
        const clickWithPreset = (preset?: string): ImageLayer => {
            const session = makeSession()
            if (preset === undefined) session.armLayerCreate('ImageLayer')
            else session.armLayerCreate('ImageLayer', preset as never)
            session.beginLayerCreate(40, 40)
            session.createTo(42, 43)
            session.endCreate()
            return session.store.doc!.layers[0] as ImageLayer
        }
        expect(clickWithPreset('free').shape).toMatchObject({ width: 200, height: 150 })
        expect(clickWithPreset().shape).toMatchObject({ width: 200, height: 150 })
    })

    it('死区点击忽略 shift：16:9 档 shift 拖入死区仍按档派生（非反转 1:1）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '16:9')
        session.beginLayerCreate(40, 40)
        session.createTo(42, 43, true)
        session.endCreate()
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 200, height: 113 })
    })

    it('档位不越层型：文本层带交叉比例档（不落载荷）点击保持工厂缺省 200×60；QR 恒 120×120', () => {
        const session = makeSession()
        session.armLayerCreate('TextLayer', '1:1' as never)
        session.beginLayerCreate(40, 40)
        session.createTo(42, 43)
        session.endCreate()
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 200, height: 60 })

        const qr = makeSession()
        qr.armLayerCreate('QrCodeLayer')
        qr.beginLayerCreate(40, 40)
        qr.createTo(42, 43)
        qr.endCreate()
        expect(qr.store.doc!.layers[0]!.shape).toMatchObject({ width: 120, height: 120 })
    })

    it('死区外落库取手势末态钳制结果（含 Shift 反转末态）：free 档 + Shift → 220×220', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', 'free')
        session.beginLayerCreate(0, 0)
        session.createTo(220, 190, true) // 生效档自由按 Shift = 临时钳 1:1
        session.endCreate()
        expect(session.store.doc!.layers[0]!.shape).toMatchObject({ width: 220, height: 220 })
    })
})

describe('createTo：预设档钳橡皮筋与 Shift 瞬时反转（生效档 = 载荷档或自由）', () => {
    it('16:9 档：拖 200×10 → 长轴驱动钳 200×113（无 Shift）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '16:9')
        session.beginLayerCreate(0, 0)
        session.createTo(200, 10)
        expect(session.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 200, height: 113 })
    })

    it('Shift 反转：具名档临时自由、自由（含无载荷）临时钳 1:1，松开还原', () => {
        const named = makeSession()
        named.armLayerCreate('ImageLayer', '1:1')
        named.beginLayerCreate(0, 0)
        named.createTo(120, 90, true) // 具名档按 Shift = 临时自由
        expect(named.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 90 })
        named.createTo(120, 90) // 松开还原档钳
        expect(named.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 120 })

        const plain = makeSession()
        plain.armLayerCreate('ImageLayer')
        plain.beginLayerCreate(0, 0)
        plain.createTo(120, 90, true) // 无载荷（自由）按 Shift = 临时钳 1:1
        expect(plain.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 120 })
    })

    it('Shift 反转不落持久态：载荷原样、零历史、文档不动（一次性消费前）', () => {
        const session = makeSession([textLayer()])
        const docBefore = session.store.doc
        session.armLayerCreate('ImageLayer', '16:9')
        session.beginLayerCreate(0, 0)
        session.createTo(200, 10, true)
        expect(session.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 200, height: 10 }) // 临时自由
        expect(session.store.ui.armedCreatePreset).toBe('16:9') // 载荷不随 Shift 变
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc).toBe(docBefore)
        session.createTo(200, 10) // 松开还原档钳（逐帧求值）
        expect(session.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 200, height: 113 })
    })

    it('非图片层不消费比例档且 Shift 无效果：文本层自由（含按 Shift）、QR 恒方', () => {
        const text = makeSession()
        text.armLayerCreate('TextLayer')
        text.beginLayerCreate(0, 0)
        text.createTo(120, 90)
        expect(text.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 90 })
        text.createTo(120, 90, true)
        expect(text.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 120, height: 90 })

        const qr = makeSession()
        qr.armLayerCreate('QrCodeLayer')
        qr.beginLayerCreate(100, 100)
        qr.createTo(180, 140, true)
        expect(qr.store.ui.create!.rect).toEqual({ x: 100, y: 100, width: 80, height: 80 })
    })
})

describe('普通武装语义（无载荷）：文本按新层样式槽、图片恒自由', () => {
    it('属性面板预写槽 + 普通武装 → endCreate 落槽值（信号完整保留）', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['fontSize'], 32)
        session.armLayerCreate('TextLayer')
        session.beginLayerCreate(40, 40)
        session.createTo(42, 43)
        session.endCreate()
        expect((session.store.doc!.layers[1] as TextLayer).fontSize).toBe(32)
    })

    it('普通图片武装：橡皮筋自由钳、死区点击工厂缺省（预设不粘——上一次预设武装消费后无残留）', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', '1:1') // 先预设武装
        session.beginLayerCreate(0, 0)
        session.createTo(120, 120)
        session.endCreate() // 一次性消费
        // 再普通武装：不受上次预设影响
        session.armLayerCreate('ImageLayer')
        expect(session.store.ui.armedCreatePreset).toBe('')
        session.beginLayerCreate(0, 0)
        session.createTo(200, 10)
        expect(session.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 200, height: 10 }) // 自由钳
        session.endCreate()
        expect(session.store.doc!.layers[1]!.shape).toMatchObject({ width: 200, height: 10 }) // 死区外取末态
        // 普通武装死区点击 = 工厂缺省（free 缺省语义）
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(40, 40)
        session.createTo(42, 43)
        session.endCreate()
        expect(session.store.doc!.layers[2]!.shape).toMatchObject({ width: 200, height: 150 })
    })
})

describe('prefs 往返：nextLayerRatio 退役（停写停读），旧快照宽容忽略，nextTextStyle 照走', () => {
    it('getEditorPrefs 不再带出 nextLayerRatio（prefs 桶 = 标尺/锚点/新层样式三键）', () => {
        const session = makeSession()
        expect(Object.keys(session.getEditorPrefs()).sort()).toEqual([
            'anchorExpanded',
            'nextTextStyle',
            'rulersVisible',
        ])
    })

    it('旧快照含 nextLayerRatio 遗留键：宽容忽略不抛错，档位不复活（消费走载荷、无槽可读）', () => {
        const session = makeSession()
        expect(() =>
            session.applyEditorPrefs({
                rulersVisible: false,
                anchorExpanded: true,
                nextTextStyle: session.store.ui.nextTextStyle,
                nextLayerRatio: '1:1', // 旧快照遗留键（schemaVersion 加法演进，恢复侧宽容忽略）
                junk: 1,
            } as never),
        ).not.toThrow()
        expect(session.store.ui.rulersVisible).toBe(false)
        expect(session.store.ui.anchorExpanded).toBe(true)
        // 遗留档位不复活：普通武装画拉恒自由（非 1:1 钳）
        session.armLayerCreate('ImageLayer')
        session.beginLayerCreate(0, 0)
        session.createTo(200, 10)
        expect(session.store.ui.create!.rect).toEqual({ x: 0, y: 0, width: 200, height: 10 })
    })

    it('nextTextStyle 照走：getEditorPrefs 带出、applyEditorPrefs 宽容读逐字段合并（跨会话承诺不变）', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['font'], 'Noto Sans SC')
        session.updateSpec(['layers', 0], ['fontSize'], 40)
        const prefs = session.getEditorPrefs()
        expect(prefs.nextTextStyle).toMatchObject({ font: 'Noto Sans SC', fontSize: 40 })

        const other = makeSession()
        other.applyEditorPrefs(prefs)
        expect(other.store.ui.nextTextStyle).toMatchObject({ font: 'Noto Sans SC', fontSize: 40 })
    })
})

describe('graph 往返零 diff（预设载荷不触 wire 面）', () => {
    it('预设钳建层 + Shift 等比缩放后的 encode→decode→encode 恒等；载荷不在文档 patch 里', () => {
        const session = makeSession([imageLayer()])
        session.armLayerCreate('ImageLayer', '16:9')
        session.beginLayerCreate(100, 100)
        session.createTo(300, 110) // 16:9 档钳 → 200×113
        session.endCreate()
        session.beginResize(['layers', 1], 'se', 300, 113)
        session.resizeTo(360, 130, true)
        session.endResize()
        expect(
            session.store.history.some((step) => step.patches.some((p) => p.path.includes('preset'))),
        ).toBe(false)

        const first = encodeGraph(session.store.doc!)
        const second = encodeGraph(decodeGraph(JSON.parse(JSON.stringify(first))))
        expect(second).toEqual(first)
    })
})
