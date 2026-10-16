import { describe, expect, it, vi } from 'vitest'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import type { Canvas } from '@hankchen/canvas'

import { cellLayer, imageLayer, qrLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

/**
 * 会话内容独占（canvas-web-edit-overlay-toolbar 工单 02，ADR 0019）：
 * - 活标志防御路由：内核 toggleDataMode 会话期被调用只翻会话标志（零文档变更零
 *   历史步），非会话期才是正常模式切换（一步历史）；
 * - 草稿接管：旁门内容写（updateData / updateDataExpression / 查找替换）命中
 *   编辑层 → 文档落库 + 会话 draftSeq 递增（绑定层据此全量接管 textarea 草稿）；
 * - 提交去向按退出时会话标志现态裁决（取代旧「进入时快照」）。
 */

/** 同步手动调度器：测试里不真正驱动重绘，只让会话可构造 */
const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(doc: Canvas): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument(doc)
    return editor
}

const singleTextDoc = (): Canvas => ({
    width: 400,
    height: 300,
    layers: [textLayer({ priority: 10, position: { anchor: 'top-left', x: 40, y: 30 } })],
})

const markedDoc = (): Canvas => {
    const expression = '姓名：{{row.name}}'
    return {
        width: 400,
        height: 300,
        layers: [textLayer({ priority: 10, text: expression, expression })],
    }
}

describe('toggleDataMode：内核模式切换动作（活标志防御路由）', () => {
    it('会话期调用只翻会话标志：文档引用不变、零历史步、仅 ui.editing 通知', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        const docBefore = editor.store.doc
        const changes: unknown[] = []
        editor.subscribe((c) => changes.push(c))

        editor.toggleDataMode(['layers', 0])

        expect(editor.store.ui.editing).toMatchObject({ path: ['layers', 0], expression: true })
        expect(editor.store.doc).toBe(docBefore)
        expect(editor.store.history).toHaveLength(0)
        expect(changes).toEqual([{ scope: 'ui', branch: 'editing' }])

        // 同一会话内往返：标志翻回、仍零历史
        editor.toggleDataMode(['layers', 0])
        expect(editor.store.ui.editing).toMatchObject({ expression: false })
        expect(editor.store.history).toHaveLength(0)
    })

    it('会话期翻标志实时反映到 textEditLayout.expressionMode（pill/面板锁定段同源显示）', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        expect(editor.textEditLayout(['layers', 0])!.expressionMode).toBe(false)

        editor.toggleDataMode(['layers', 0])
        expect(editor.textEditLayout(['layers', 0])!.expressionMode).toBe(true)
    })

    it('会话期翻标志不动草稿接管序号（draftSeq：标志翻转 ≠ 内容写）', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        editor.toggleDataMode(['layers', 0])
        editor.toggleDataMode(['layers', 0])
        expect(editor.store.ui.editing?.draftSeq).toBeUndefined()
    })

    it('标记层会话期调用：标志翻静态、层标记保持（文档未动，提交去向随会话）', () => {
        const editor = makeEditor(markedDoc())
        editor.beginTextEdit(['layers', 0])

        editor.toggleDataMode(['layers', 0])

        expect(editor.store.ui.editing).toMatchObject({ expression: false })
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('姓名：{{row.name}}')
        expect(editor.store.history).toHaveLength(0)
    })
})

describe('toggleDataMode：非会话期 = 正常模式切换（面板既有语义收编内核）', () => {
    it('静态 → 表达式：初值 = 字面原文，一步历史', () => {
        const editor = makeEditor(singleTextDoc())

        editor.toggleDataMode(['layers', 0])

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('你好画布')
        expect(layer.type === 'TextLayer' && layer.text).toBe('你好画布')
        expect(editor.store.history).toHaveLength(1)
    })

    it('表达式 → 静态：字面接管（值保持现镜像），一步历史', () => {
        const editor = makeEditor(markedDoc())

        editor.toggleDataMode(['layers', 0])

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(layer.type === 'TextLayer' && layer.text).toBe('姓名：{{row.name}}')
        expect(editor.store.history).toHaveLength(1)
    })

    it('三内容层分派各取值字段；表/行/格与悬空路径空转', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [
                imageLayer({ priority: 30 }),
                qrLayer({ priority: 20 }),
                tableLayer([rowLayer([cellLayer(textLayer({ priority: 1 }), { shape: { width: 200, height: 60 } })])]),
            ],
        })

        editor.toggleDataMode(['layers', 0])
        editor.toggleDataMode(['layers', 1])
        const image = editor.store.doc!.layers[0]!
        const qr = editor.store.doc!.layers[1]!
        // 资源面切换初值（死端态整改条目 4）：静态违例字面不镜像，落「未选择」空态
        // ——Image src null → 空串、Qr 文案值（违例）→ 空串
        expect(image.type === 'ImageLayer' && image.expression).toBe('')
        expect(qr.type === 'QrCodeLayer' && qr.expression).toBe('')

        const historyAfterContent = editor.store.history.length
        editor.toggleDataMode(['layers', 2]) // 表格无数据字段
        editor.toggleDataMode(['layers', 0, 'rows', 0]) // 行
        editor.toggleDataMode(['layers', 0, 'rows', 0, 'cells', 0]) // 格
        editor.toggleDataMode(['layers', 9]) // 悬空
        expect(editor.store.history).toHaveLength(historyAfterContent)
    })

    it('会话在 A 层时对 B 层调用：B 层正常切换（防御路由只命中编辑层）', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10 }), textLayer({ priority: 5, text: '乙' })],
        })
        editor.beginTextEdit(['layers', 0])

        editor.toggleDataMode(['layers', 1])

        expect(editor.store.ui.editing).toMatchObject({ path: ['layers', 0], expression: false })
        const other = editor.store.doc!.layers[1]!
        expect(other.type === 'TextLayer' && other.expression).toBe('乙')
        expect(editor.store.history).toHaveLength(1)
    })

    it('资源面切换初值（死端态整改条目 4）：违例字面落空态，合法引用字面镜像（往返无损）', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [
                imageLayer({ priority: 30, src: 'https://cdn.example.com/photo.jpg' }),
                qrLayer({ priority: 20, value: '{{orderNo}}' }),
                imageLayer({ priority: 10, src: '{{cover}}' }),
            ],
        })

        editor.toggleDataMode(['layers', 0])
        editor.toggleDataMode(['layers', 1])
        editor.toggleDataMode(['layers', 2])

        const image = editor.store.doc!.layers[0]!
        const qr = editor.store.doc!.layers[1]!
        const roundtrip = editor.store.doc!.layers[2]!
        // URL 字面不是合法单引用 → 切换落「未选择」空态（src 随镜像同空，撤销一步可回）
        expect(image.type === 'ImageLayer' && image.expression).toBe('')
        expect(image.type === 'ImageLayer' && image.src).toBe('')
        // QR 值已是合法单引用 → 镜像保留（静态 ⇆ 表达式往返无损）
        expect(qr.type === 'QrCodeLayer' && qr.expression).toBe('{{orderNo}}')
        expect(qr.type === 'QrCodeLayer' && qr.value).toBe('{{orderNo}}')
        // Image 的模板形态字面同款往返
        expect(roundtrip.type === 'ImageLayer' && roundtrip.expression).toBe('{{cover}}')
        expect(editor.store.history).toHaveLength(3)
    })
})

describe('草稿接管：旁门内容写命中编辑层（文档落库 + draftSeq 递增）', () => {
    it('updateData 命中编辑层：文档更新 + draftSeq = 1，通知序 doc → ui.editing', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        const changes: unknown[] = []
        editor.subscribe((c) => changes.push(c))

        editor.updateData(['layers', 0], '替换结果')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('替换结果')
        expect(editor.store.ui.editing).toMatchObject({ path: ['layers', 0], draftSeq: 1 })
        expect(changes.map((c) => (c as { scope: string }).scope)).toEqual(['doc', 'ui'])
    })

    it('连续接管递增：draftSeq 2；同值写（零变更事务）不接管', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        editor.updateData(['layers', 0], '第一次')
        editor.updateData(['layers', 0], '第二次')
        expect(editor.store.ui.editing?.draftSeq).toBe(2)

        editor.updateData(['layers', 0], '第二次') // 同值：transact 空转
        expect(editor.store.ui.editing?.draftSeq).toBe(2)
    })

    it('updateDataExpression 命中编辑层：标记写 + 草稿接管（镜像文本成为草稿新值）', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        editor.updateDataExpression(['layers', 0], '订单 {{orderNo}}')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('订单 {{orderNo}}')
        expect(editor.store.ui.editing).toMatchObject({ draftSeq: 1 })
        // 接管后编辑框读数（layout.text）= 文档镜像新值
        expect(editor.textEditLayout(['layers', 0])!.text).toBe('订单 {{orderNo}}')
    })

    it('未命中编辑层的写不接管：其他层 updateData 与非编辑路径均不动 draftSeq', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10 }), textLayer({ priority: 5, text: '乙' })],
        })
        editor.beginTextEdit(['layers', 0])

        editor.updateData(['layers', 1], '改别人')
        expect(editor.store.ui.editing?.draftSeq).toBeUndefined()
    })

    it('查找替换接管：replaceAll 命中编辑层 → draftSeq 递增；未命中不递增', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: '证书甲姓名' }), textLayer({ priority: 5, text: '证书乙姓名' })],
        })
        editor.beginTextEdit(['layers', 0])

        editor.setFindQuery('证书')
        editor.setFindReplacement('奖状')
        const applied = editor.replaceAll()

        expect(applied).toBe(2)
        expect(editor.store.ui.editing).toMatchObject({ path: ['layers', 0], draftSeq: 1 })
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '奖状甲姓名' })
        // 编辑框读数随文档新值（替换结果出现在正在编辑的框里）
        expect(editor.textEditLayout(['layers', 0])!.text).toBe('奖状甲姓名')

        // 第二次全替换无命中：零变更不接管
        editor.setFindQuery('不存在的串')
        expect(editor.replaceAll()).toBe(0)
        expect(editor.store.ui.editing?.draftSeq).toBe(1)
    })

    it('replaceOne 命中编辑层：同门接管', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: '甲姓名甲' })],
        })
        editor.beginTextEdit(['layers', 0])

        editor.setFindQuery('甲')
        editor.setFindReplacement('乙')
        expect(editor.replaceOne()).toBe(true)

        expect(editor.store.ui.editing).toMatchObject({ draftSeq: 1 })
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '乙姓名甲' })
    })

    it('查找替换豁免标记层：表达式会话不被命中、不接管', () => {
        const editor = makeEditor(markedDoc())
        editor.beginTextEdit(['layers', 0])

        editor.setFindQuery('姓名')
        expect(editor.listFindMatches()).toHaveLength(0)
        expect(editor.replaceAll()).toBe(0)
        expect(editor.store.ui.editing?.draftSeq).toBeUndefined()
    })

    it('非会话期写不动任何会话态（editing 为 null，无接管面）', () => {
        const editor = makeEditor(singleTextDoc())
        expect(() => editor.updateData(['layers', 0], '直接落库')).not.toThrow()
        expect(editor.store.ui.editing).toBeNull()
    })
})

describe('提交去向按退出时会话标志现态裁决（活标志取代快照）', () => {
    it('进入静态后经内核路由翻表达式：含合法片段提交落 updateDataExpression 标记写', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        expect(editor.store.ui.editing).toMatchObject({ expression: false })

        editor.toggleDataMode(['layers', 0]) // 防御路径：只翻标志
        expect(editor.commitTextEdit('订单 {{orderNo}}')).toBe(true)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('订单 {{orderNo}}')
        expect(layer.type === 'TextLayer' && layer.text).toBe('订单 {{orderNo}}')
        expect(editor.store.history).toHaveLength(1)
    })

    it('进入表达式后翻静态：提交按字面写解标（含 {{}} 按字面保留）', () => {
        const editor = makeEditor(markedDoc())
        editor.beginTextEdit(['layers', 0])
        editor.toggleDataMode(['layers', 0]) // 翻静态

        expect(editor.commitTextEdit('前缀 {{x}} 后缀')).toBe(true)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('前缀 {{x}} 后缀')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })

    it('旁门打标不翻标志：静态会话期 updateDataExpression 落文档，提交仍按字面会话矩阵', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        // 程序化打标（旁门）：文档落库 + 草稿接管，但会话标志不随动
        editor.updateDataExpression(['layers', 0], '{{certCode}}')
        expect(editor.store.ui.editing).toMatchObject({ expression: false, draftSeq: 1 })

        // 接管后编辑框草稿 = 镜像新值；模拟用户续写后退出 → 标志（静态）裁决字面写
        expect(editor.commitTextEdit('改成字面')).toBe(true)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('改成字面')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        // 草稿接管步 + 提交步各一步
        expect(editor.store.history).toHaveLength(2)
    })

    it('接管后串与文档一致：退出零历史（接管步即唯一一步）', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: '证书甲姓名' })],
        })
        editor.beginTextEdit(['layers', 0])

        editor.setFindQuery('证书')
        editor.setFindReplacement('奖状')
        editor.replaceAll() // 接管：草稿 = '奖状甲姓名' = 文档现值
        const historyAfterTakeover = editor.store.history.length

        // 退出串即文档现值：提交零噪声（比对对象随会话模式 = layer.text）
        expect(editor.commitTextEdit('奖状甲姓名')).toBe(false)
        expect(editor.store.history).toHaveLength(historyAfterTakeover)
        expect(editor.store.ui.editing).toBeNull()
    })

    it('接管后继续改串：退出各一步（替换步 + 提交步），清空退出删层可撤销', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: '证书甲姓名' })],
        })
        editor.beginTextEdit(['layers', 0])

        editor.setFindQuery('证书')
        editor.setFindReplacement('奖状')
        editor.replaceAll()
        expect(editor.commitTextEdit('')).toBe(true) // 接管后清空退出：删层

        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(editor.store.history).toHaveLength(2) // 替换步 + 删层步

        editor.undo()
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '奖状甲姓名' })
        editor.undo()
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '证书甲姓名' })
    })

    it('旁门解标不翻标志：表达式会话提交串与 text 一致仍不短路（比对对象随标志取 expression）', () => {
        const expression = '姓名：{{row.name}}'
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: expression, expression })],
        })
        editor.beginTextEdit(['layers', 0]) // 表达式会话
        // 旁门字面写（解标）：text = '旁门文案'、expression = null；标志不随动
        editor.updateData(['layers', 0], '旁门文案')
        const historyBefore = editor.store.history.length

        // 提交串与 layer.text 一致——若错比 text 会短路零历史；活标志（表达式）
        // 裁决比对 layer.expression（null）→ 不短路。无合法片段回落字面写：
        // 值与现 text 同串 → 零 patch 不再进历史（解标由旁门步自身承担）
        expect(editor.commitTextEdit('旁门文案')).toBe(true)
        expect(editor.store.history).toHaveLength(historyBefore)
        expect(editor.store.ui.editing).toBeNull()
    })
})

describe('草稿接管不动会话其余语义（防御边界）', () => {
    it('commitTextEdit 自身的落库不复入接管（先清会话再写，draftSeq 不产生）', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        expect(editor.commitTextEdit('正常退出')).toBe(true)

        expect(editor.store.ui.editing).toBeNull()
        expect(editor.store.history).toHaveLength(1)
    })

    it('openDocument 清会话后接管序号随会话消失', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        editor.updateData(['layers', 0], '接管过')
        expect(editor.store.ui.editing?.draftSeq).toBe(1)

        editor.openDocument(singleTextDoc())
        expect(editor.store.ui.editing).toBeNull()
    })

    it('接管通知驱动订阅方：ui.editing 分支广播（绑定层反应锚）', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        const listener = vi.fn()
        editor.subscribe(listener)

        editor.updateData(['layers', 0], '再接管')

        expect(listener).toHaveBeenCalledWith({ scope: 'ui', branch: 'editing' })
    })
})
