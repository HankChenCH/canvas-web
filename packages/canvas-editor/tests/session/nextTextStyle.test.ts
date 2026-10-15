/**
 * 新层样式槽与文本预设（canvas-web-text-defaults 工单 01，spec 决策 1-4/6）：
 * - 槽住 store ui 分支（编辑器级偏好）：updateSpec 对 TextLayer 文本族五字段的
 *   权威写捕获进槽；openDocument 换文档不清空；不进历史；
 * - 消费：endCreate（画拉）与 addRootLayer（面板新增）以槽值覆盖工厂缺省；
 *   createTemplateTable / 表格结构不消费（模板语义保持确定性缺省）；
 * - 预设 = 写槽的快捷方式：armLayerCreate('TextLayer', preset) 先写槽再武装；
 * - prefs 读写对：getEditorPrefs 带出、applyEditorPrefs 宽容读逐字段合并
 *   （缺字/类型不符保留现值、未知键忽略）。
 */
import { describe, expect, it } from 'vitest'

import type { Canvas, Layer, TableLayer, TextLayer } from '@hankchen/canvas'

import { defaultNextTextStyle, pickNextTextStylePatch } from '../../src/editing/layerPanel'
import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { imageLayer, qrLayer, textLayer } from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const docWith = (...layers: Layer[]): Canvas => ({ width: 800, height: 600, layers })

const makeSession = (layers: Layer[] = []): EditorSession => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(docWith(...layers))
    return session
}

const textAt = (session: EditorSession, index: number): TextLayer =>
    session.store.doc!.layers[index] as TextLayer

describe('槽初值与捕获（updateSpec 漏斗）', () => {
    it('槽初值 = 工厂 TextLayer 缺省（单一事实源自工厂派生）', () => {
        const session = makeSession()
        expect(session.store.ui.nextTextStyle).toEqual(defaultNextTextStyle())
        expect(session.store.ui.nextTextStyle).toEqual({
            font: '',
            fontSize: 24,
            fontColor: '#111827',
            autowrap: false,
            lineHeight: 1.2,
        })
    })

    it('捕获五字段：font/fontSize/fontColor/autowrap/shape.lineHeight 逐一入槽', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['font'], 'Noto Sans SC')
        expect(session.store.ui.nextTextStyle.font).toBe('Noto Sans SC')
        session.updateSpec(['layers', 0], ['fontSize'], 40)
        expect(session.store.ui.nextTextStyle.fontSize).toBe(40)
        session.updateSpec(['layers', 0], ['fontColor'], '#ff0000')
        expect(session.store.ui.nextTextStyle.fontColor).toBe('#ff0000')
        session.updateSpec(['layers', 0], ['autowrap'], true)
        expect(session.store.ui.nextTextStyle.autowrap).toBe(true)
        session.updateSpec(['layers', 0], ['shape', 'lineHeight'], 1.5)
        expect(session.store.ui.nextTextStyle.lineHeight).toBe(1.5)
    })

    it('autowrap 捕获严格布尔：类型不符跳过该字段（不强转，票 01 口径「不符跳过」）', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['autowrap'], 'yes' as never)
        expect(session.store.ui.nextTextStyle.autowrap).toBe(false)
        session.updateSpec(['layers', 0], ['autowrap'], true)
        expect(session.store.ui.nextTextStyle.autowrap).toBe(true)
    })

    it('非文本层写不捕获（qr/image 无偏好语义）', () => {
        const session = makeSession([qrLayer(), imageLayer()])
        session.updateSpec(['layers', 0], ['font'], 'X')
        session.updateSpec(['layers', 1], ['fontSize'], 99)
        expect(session.store.ui.nextTextStyle).toEqual(defaultNextTextStyle())
    })

    it('同值重写值等短路（零通知）、非样式字段不捕获', () => {
        const session = makeSession([textLayer()])
        let notified = 0
        const unsubscribe = session.subscribe((change) => {
            if (change.scope === 'ui' && change.branch === 'nextTextStyle') notified += 1
        })
        session.updateSpec(['layers', 0], ['fontSize'], 24) // 同值：事务空转 + 槽短路
        session.updateSpec(['layers', 0], ['text'], '内容写不算样式偏好')
        session.updateSpec(['layers', 0], ['angle'], 15)
        session.updateSpec(['layers', 0], ['shape', 'width'], 300)
        expect(notified).toBe(0)
        expect(session.store.ui.nextTextStyle).toEqual(defaultNextTextStyle())
        unsubscribe()
    })

    it('updateData（内容写）与样式粘贴不捕获；undo 不回滚槽', () => {
        const session = makeSession([textLayer({ font: 'A', fontSize: 10 }), textLayer({ font: 'B', fontSize: 20 })])
        session.updateSpec(['layers', 0], ['font'], 'Inter')
        session.updateSpec(['layers', 0], ['fontSize'], 33)
        expect(session.store.ui.nextTextStyle).toMatchObject({ font: 'Inter', fontSize: 33 })

        // 内容写不表达偏好
        session.updateData(['layers', 0], '新内容')
        expect(session.store.ui.nextTextStyle.font).toBe('Inter')

        // 样式粘贴（搬运语义）不改槽：B 层贴上后槽仍 Inter/33
        expect(session.copyStyle(['layers', 1])).toBe(true)
        expect(session.pasteStyle(['layers', 0])).toBe(true)
        expect(session.store.ui.nextTextStyle).toMatchObject({ font: 'Inter', fontSize: 33 })

        // 撤销全部文档步（样式写×2 + 内容写 + 样式粘贴 = 4 步历史）：文档回退，
        // 槽（偏好）不随之回滚——undo 走 doc patch 回放，不经过 updateSpec 漏斗
        session.undo()
        session.undo()
        session.undo()
        session.undo()
        expect(textAt(session, 0).font).toBe('A')
        expect(textAt(session, 0).fontSize).toBe(10)
        expect(session.store.ui.nextTextStyle).toMatchObject({ font: 'Inter', fontSize: 33 })
    })

    it('槽写不进历史（ui 分支，undo/redo 栈零增长）', () => {
        const session = makeSession([textLayer()])
        const before = session.store.history.length
        session.updateSpec(['layers', 0], ['font'], 'Inter')
        expect(session.store.history.length).toBe(before + 1) // 文档写本身是一步
        expect(session.store.history.some((step) => step.patches.some((p) => p.path.includes('nextTextStyle')))).toBe(false)
    })

    it('openDocument 换文档不清槽（偏好内核自持，anchorExpanded 同门）', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['fontSize'], 40)
        session.openDocument(docWith())
        expect(session.store.ui.nextTextStyle.fontSize).toBe(40)
    })
})

describe('消费：建层入口以槽值覆盖工厂缺省', () => {
    it('endCreate 死区点击：新文本层落槽值', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['font'], 'Noto Sans SC')
        session.updateSpec(['layers', 0], ['fontSize'], 40)
        session.updateSpec(['layers', 0], ['fontColor'], '#2563eb')
        session.updateSpec(['layers', 0], ['autowrap'], true)
        session.updateSpec(['layers', 0], ['shape', 'lineHeight'], 1.5)
        session.armLayerCreate('TextLayer')
        expect(session.beginLayerCreate(100, 100)).toBe(true)
        const path = session.endCreate()
        expect(path).toEqual(['layers', 1])
        const created = textAt(session, 1)
        expect(created.font).toBe('Noto Sans SC')
        expect(created.fontSize).toBe(40)
        expect(created.fontColor).toBe('#2563eb')
        expect(created.autowrap).toBe(true)
        expect(created.shape.lineHeight).toBe(1.5)
        expect(created.angle).toBe(0) // 槽外字段保持工厂缺省
    })

    it('addRootLayer（面板新增）：新文本层落槽值', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['fontSize'], 32)
        session.updateSpec(['layers', 0], ['autowrap'], true)
        session.addRootLayer('TextLayer')
        const created = textAt(session, 1)
        expect(created.fontSize).toBe(32)
        expect(created.autowrap).toBe(true)
        expect(created.font).toBe('')
    })

    it('非文本层建层不受槽影响', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['fontSize'], 40)
        session.addRootLayer('QrCodeLayer')
        expect(session.store.doc!.layers[1]!.type).toBe('QrCodeLayer')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(40)
    })

    it('createTemplateTable 格内容保持工厂缺省（模板语义不被偏好污染）', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['font'], 'Noto Sans SC')
        session.updateSpec(['layers', 0], ['fontSize'], 40)
        // 直建 action 已退役（template-table-drag-create 工单 04）：生产等价路径 =
        // 风味武装 + 死区点击兜底（缺省壳落点击点）
        session.armTemplateTableCreate('rows')
        expect(session.beginLayerCreate(60, 50)).toBe(true)
        session.endCreate()
        const table = session.store.doc!.layers[1] as TableLayer
        expect(table.type).toBe('TableLayer')
        const content = table.template!.cells[0]!.content as TextLayer
        expect(content.fontSize).toBe(24)
        expect(content.font).toBe('')
    })
})

describe('文本预设（写槽的快捷方式）', () => {
    it("armLayerCreate('TextLayer', 'heading')：先写槽再武装", () => {
        const session = makeSession([textLayer()])
        session.armLayerCreate('TextLayer', 'heading')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(40)
        expect(session.store.ui.armedCreate).toBe('TextLayer')
        expect(session.beginLayerCreate(50, 50)).toBe(true)
        session.endCreate()
        expect(textAt(session, 1).fontSize).toBe(40)
    })

    it('三档字号：heading 40 / subheading 28 / body 16', () => {
        const session = makeSession()
        session.armLayerCreate('TextLayer', 'subheading')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(28)
        session.cancelArmLayerCreate()
        session.armLayerCreate('TextLayer', 'body')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(16)
    })

    it('非文本层武装忽略 preset；未知 preset 只跳写槽、武装照常', () => {
        const session = makeSession()
        session.armLayerCreate('ImageLayer', 'heading')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(24)
        expect(session.store.ui.armedCreate).toBe('ImageLayer')
        session.cancelArmLayerCreate()
        session.armLayerCreate('TextLayer', 'nope' as never)
        expect(session.store.ui.nextTextStyle.fontSize).toBe(24)
        expect(session.store.ui.armedCreate).toBe('TextLayer')
    })

    it('无 preset 的武装不动槽（快捷键入口同门：捕获值原样保留）', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['fontSize'], 33)
        session.armLayerCreate('TextLayer')
        expect(session.store.ui.nextTextStyle.fontSize).toBe(33)
        expect(session.store.ui.nextTextStyle.font).toBe('')
        expect(session.store.ui.armedCreate).toBe('TextLayer')
    })
})

describe('prefs 读写对（宽容读逐字段合并）', () => {
    it('getEditorPrefs 带出槽；applyEditorPrefs 全法形状恢复', () => {
        const session = makeSession([textLayer()])
        session.updateSpec(['layers', 0], ['font'], 'Noto Sans SC')
        session.updateSpec(['layers', 0], ['fontSize'], 40)
        const prefs = session.getEditorPrefs()
        expect(prefs.nextTextStyle).toMatchObject({ font: 'Noto Sans SC', fontSize: 40 })

        const other = makeSession()
        other.applyEditorPrefs(prefs)
        expect(other.store.ui.nextTextStyle).toMatchObject({ font: 'Noto Sans SC', fontSize: 40 })
    })

    it('宽容读：缺字段保留现值、类型不符忽略该字段、未知键忽略、非对象整体忽略', () => {
        const session = makeSession()
        session.updateSpec(['layers', 0], ['font'], 'Inter') // 先把槽搬离工厂值
        const before = session.store.ui.nextTextStyle

        session.applyEditorPrefs({
            rulersVisible: true,
            anchorExpanded: false,
            nextLayerRatio: 'free',
            nextTextStyle: { font: 'A', fontSize: 30, autowrap: true } as never, // 缺 fontColor/lineHeight
        })
        expect(session.store.ui.nextTextStyle).toMatchObject({ font: 'A', fontSize: 30, autowrap: true })
        expect(session.store.ui.nextTextStyle.fontColor).toBe(before.fontColor)
        expect(session.store.ui.nextTextStyle.lineHeight).toBe(before.lineHeight)

        session.applyEditorPrefs({
            rulersVisible: true,
            anchorExpanded: false,
            nextLayerRatio: 'free',
            nextTextStyle: { font: 42, fontSize: 'big', autowrap: 'yes', lineHeight: -1, fontColor: 'C', junk: 1 } as never,
        })
        expect(session.store.ui.nextTextStyle.fontColor).toBe('C') // 合法字段进
        expect(session.store.ui.nextTextStyle.font).toBe('A') // 类型不符保留现值
        expect(session.store.ui.nextTextStyle.fontSize).toBe(30)
        expect(session.store.ui.nextTextStyle.autowrap).toBe(true)
        expect(session.store.ui.nextTextStyle.lineHeight).toBe(before.lineHeight) // 非法值忽略

        session.applyEditorPrefs({ rulersVisible: true, anchorExpanded: false, nextLayerRatio: 'free', nextTextStyle: null as never })
        expect(session.store.ui.nextTextStyle.font).toBe('A') // 非对象整体忽略
    })

    it('pickNextTextStylePatch 纯函数：只收合法字段（捕获与 prefs 恢复合一谓词）', () => {
        expect(pickNextTextStylePatch({ font: 'A', fontSize: 30, lineHeight: 1.5, junk: 1 })).toEqual({
            font: 'A',
            fontSize: 30,
            lineHeight: 1.5,
        })
        expect(pickNextTextStylePatch(null)).toEqual({})
        expect(pickNextTextStylePatch('x')).toEqual({})
        expect(pickNextTextStylePatch({ fontSize: Number.NaN })).toEqual({})
    })

    it('autowrap 严格布尔：类型不符跳过该字段（评审合流——捕获与恢复同口径，不强转）', () => {
        expect(pickNextTextStylePatch({ autowrap: true })).toEqual({ autowrap: true })
        expect(pickNextTextStylePatch({ autowrap: 'yes' })).toEqual({})
        expect(pickNextTextStylePatch({ autowrap: 1 })).toEqual({})
        expect(pickNextTextStylePatch({ autowrap: null })).toEqual({})
    })
})
