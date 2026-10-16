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

import type { Canvas, Layer } from '@hankchen/canvas'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'

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
