import { describe, expect, it, vi } from 'vitest'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import type { Canvas } from '@hankchen/canvas-next'

import { cellLayer, imageLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

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

describe('beginTextEdit：进入文本编辑（会话住 ui 分支，不进历史）', () => {
    it('文本层返回 true，ui.editing 记录路径并以 editing 分支通知', () => {
        const editor = makeEditor(singleTextDoc())
        const changes: unknown[] = []
        editor.subscribe((c) => changes.push(c))

        expect(editor.beginTextEdit(['layers', 0])).toBe(true)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })
        expect(changes).toEqual([{ scope: 'ui', branch: 'editing' }])
    })

    it('会话标志按进入瞬间 layer.expression !== null 锚定（进入时计、编辑中稳定）', () => {
        const expression = '姓名：{{row.name}}'
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [
                textLayer({ priority: 10, text: expression, expression }),
                textLayer({ priority: 5 }),
            ],
        })

        editor.beginTextEdit(['layers', 0])
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: true })

        editor.commitTextEdit('随便改') // 清掉第一个会话
        editor.beginTextEdit(['layers', 1])
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 1], expression: false })
    })

    it('beginTextEdit 快照不受编辑中面板改动影响：字面进入后面板打标，提交仍按字面写', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        // 模拟编辑中属性面板打标（updateDataExpression 直接落文档）
        editor.updateDataExpression(['layers', 0], '{{certCode}}')

        expect(editor.store.ui.editing).toMatchObject({ path: ['layers', 0], expression: false })

        editor.commitTextEdit('改成字面')

        // 字面会话走 updateData 字面写（字面接管解标）；若错按层现状走表达式写
        // 则标记会保留——会话快照是提交去向的裁决依据
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('改成字面')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })

    it('进入编辑不产生历史步骤', () => {
        const editor = makeEditor(singleTextDoc())

        editor.beginTextEdit(['layers', 0])

        expect(editor.store.history).toHaveLength(0)
    })

    it('非文本层/越界路径返回 false 且不置会话', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [imageLayer({ priority: 10 }), textLayer({ priority: 5 })],
        })

        expect(editor.beginTextEdit(['layers', 0])).toBe(false)
        expect(editor.beginTextEdit(['layers', 9])).toBe(false)
        expect(editor.beginTextEdit(['layers'])).toBe(false)
        expect(editor.store.ui.editing).toBeNull()
    })

    it('未打开文档时返回 false', () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        expect(editor.beginTextEdit(['layers', 0])).toBe(false)
    })

    it('同路径重复进入短路不通知；编辑中换层则替换会话', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10 }), textLayer({ priority: 5 })],
        })
        const listener = vi.fn()
        editor.subscribe(listener)

        editor.beginTextEdit(['layers', 0])
        editor.beginTextEdit(['layers', 0])
        expect(listener).toHaveBeenCalledTimes(1)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 0], expression: false })

        editor.beginTextEdit(['layers', 1])
        expect(listener).toHaveBeenCalledTimes(2)
        expect(editor.store.ui.editing).toEqual({ path: ['layers', 1], expression: false })
    })
})

describe('commitTextEdit：提交漏斗（四路退出恰一步历史；先清会话保证幂等）', () => {
    it('文本变化：恰好一步历史（独立步、无 mergeKey），会话清空，文档更新', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        expect(editor.commitTextEdit('你好，画布！')).toBe(true)

        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '你好，画布！' })
        expect(editor.store.ui.editing).toBeNull()
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
    })

    it('文本未变：不进历史无文档通知，会话仍清空（退出零噪声）', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        const before = editor.store.doc
        const changes: unknown[] = []
        editor.subscribe((c) => changes.push(c))

        expect(editor.commitTextEdit('你好画布')).toBe(false)

        expect(editor.store.doc).toBe(before)
        expect(editor.store.history).toHaveLength(0)
        // 唯一的通知是会话清空（ui 分支）；文档分支零通知
        expect(changes).toEqual([{ scope: 'ui', branch: 'editing' }])
        expect(editor.store.ui.editing).toBeNull()
    })

    it('双路级联提交幂等：第二次 commit 空转（blur 与画布点按竞态不重复入栈）', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        editor.commitTextEdit('改了')
        editor.commitTextEdit('又改了')

        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '改了' })
    })

    it('未处于编辑态时提交空转', () => {
        const editor = makeEditor(singleTextDoc())
        expect(editor.commitTextEdit('x')).toBe(false)
        expect(editor.store.history).toHaveLength(0)
    })

    it('提交不并入开启中的拖动合并步：拖动与文本各成一步、撤销互不干扰', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        editor.beginDrag(['layers', 0], 0, 0)
        editor.dragTo(30, 20) // mergeKey 'drag' 的开放步

        editor.commitTextEdit('改了')

        // 提交步独立入栈（无 mergeKey），不并入开启中的拖动合并步
        expect(editor.store.history).toHaveLength(2)
        expect(editor.store.history[0]!.mergeKey).toBe('drag')
        expect(editor.store.history[1]!.mergeKey).toBeNull()

        // 撤销提交步只回退文本，拖动位移保持；重做恢复
        editor.undo()
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '你好画布', position: { x: 70, y: 50 } })
        editor.redo()
        expect(editor.store.doc!.layers[0]).toMatchObject({ text: '改了' })
        editor.endDrag()
    })

    it('路径失效（图层已被删）时只清会话不动文档', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        editor.deleteLayer(['layers', 0])

        expect(editor.commitTextEdit('x')).toBe(false)
        expect(editor.store.ui.editing).toBeNull()
    })
})

describe('空文本提交 = 删除图层（一步历史，可撤销）', () => {
    it('根层：整层删除，undo 恢复原文本图层', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        expect(editor.commitTextEdit('')).toBe(true)

        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(editor.store.ui.editing).toBeNull()
        expect(editor.store.history).toHaveLength(1)

        editor.undo()
        expect(editor.store.doc!.layers).toHaveLength(1)
        expect(editor.store.doc!.layers[0]).toMatchObject({ type: 'TextLayer', text: '你好画布' })
    })

    it('格内容文本：content 置空，undo 恢复', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [tableLayer([rowLayer([cellLayer(textLayer({ priority: 1 }), { shape: { width: 200, height: 60 } })])])],
        })
        editor.beginTextEdit(['layers', 0, 'rows', 0, 'cells', 0, 'content'])

        expect(editor.commitTextEdit('')).toBe(true)

        const table = editor.store.doc!.layers[0]!
        if (table.type !== 'TableLayer') throw new Error('fixture: 表格层')
        expect(table.rows[0]!.cells[0]!.content).toBeNull()
        expect(editor.store.history).toHaveLength(1)

        editor.undo()
        const restored = editor.store.doc!.layers[0]!
        if (restored.type !== 'TableLayer') throw new Error('fixture: 表格层')
        expect(restored.rows[0]!.cells[0]!.content?.type).toBe('TextLayer')
    })

    it('删除后选中/悬停随 splice 重映射：被删子树清空，后续兄弟前移', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10 }), imageLayer({ priority: 5 })],
        })
        editor.beginTextEdit(['layers', 0])
        editor.setSelection(['layers', 1])
        editor.setHovered(['layers', 1])

        editor.commitTextEdit('')

        expect(editor.store.ui.selection).toEqual(['layers', 0])
        expect(editor.store.ui.hovered).toEqual(['layers', 0])
    })
})

describe('表达式会话提交矩阵（spec 决策 3：空串判定先于片段判定）', () => {
    const markedDoc = (): Canvas => {
        const expression = '姓名：{{row.name}}'
        return {
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: expression, expression })],
        }
    }

    it('字面会话提交含 {{x}}：updateData 字面写按字面保留，不打标', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        expect(editor.commitTextEdit('前缀 {{x}} 后缀')).toBe(true)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('前缀 {{x}} 后缀')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(editor.store.history).toHaveLength(1)
    })

    it('表达式会话提交含合法闭合片段：updateDataExpression 改标 + text 重镜像', () => {
        const editor = makeEditor(markedDoc())
        editor.beginTextEdit(['layers', 0])
        expect(editor.store.ui.editing).toMatchObject({ expression: true })

        expect(editor.commitTextEdit('订单 {{order.items}} 共{{row.count}}件')).toBe(true)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('订单 {{order.items}} 共{{row.count}}件')
        // 重镜像：值字段恒等于表达式原文（updateDataExpression 契约）
        expect(layer.type === 'TextLayer' && layer.text).toBe('订单 {{order.items}} 共{{row.count}}件')
        expect(editor.store.history).toHaveLength(1)

        editor.undo()
        const restored = editor.store.doc!.layers[0]!
        // 一次会话一步历史：undo 整体回退文本与标记态
        expect(restored.type === 'TextLayer' && restored.expression).toBe('姓名：{{row.name}}')
        expect(restored.type === 'TextLayer' && restored.text).toBe('姓名：{{row.name}}')
    })

    it('表达式会话提交无合法片段（纯字面）：回落 updateData 字面接管解标', () => {
        const editor = makeEditor(markedDoc())
        editor.beginTextEdit(['layers', 0])

        expect(editor.commitTextEdit('没有片段的文案')).toBe(true)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('没有片段的文案')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(editor.store.history).toHaveLength(1)

        editor.undo()
        const restored = editor.store.doc!.layers[0]!
        expect(restored.type === 'TextLayer' && restored.expression).toBe('姓名：{{row.name}}')
    })

    it.each([
        ['空片段 {{}}', 'a {{}} b'],
        ['片段内空白 {{ }}', 'a {{ }} b'],
        ['路径空段 {{row..name}}', '{{row..name}}'],
        ['路径空段 {{.name}}', '{{.name}}'],
        ['未闭合 {{（open 片段）', '前缀 {{row'],
    ])('%s：按无片段处理，表达式会话回落解标', (_label, committed) => {
        const editor = makeEditor(markedDoc())
        editor.beginTextEdit(['layers', 0])
        expect(editor.commitTextEdit(committed)).toBe(true)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe(committed)
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })

    it('表达式会话提交空串：删层（空串判定先于片段判定，任何模式同语义）', () => {
        const editor = makeEditor(markedDoc())
        editor.beginTextEdit(['layers', 0])

        expect(editor.commitTextEdit('')).toBe(true)

        expect(editor.store.doc!.layers).toHaveLength(0)
        expect(editor.store.history).toHaveLength(1)

        editor.undo()
        const restored = editor.store.doc!.layers[0]!
        expect(restored.type === 'TextLayer' && restored.expression).toBe('姓名：{{row.name}}')
    })

    it('格内容标记层路径：表达式会话改标保持标记，重镜像随格内容层', () => {
        const expression = '{{row.name}}'
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [tableLayer([rowLayer([
                cellLayer(
                    textLayer({ priority: 1, text: expression, expression, shape: { width: 200, height: 60 } }),
                    { shape: { width: 200, height: 60 } },
                ),
            ])])],
        })
        const contentPath = ['layers', 0, 'rows', 0, 'cells', 0, 'content'] as const
        editor.beginTextEdit(contentPath)

        expect(editor.commitTextEdit('姓名：{{row.name}}')).toBe(true)

        const table = editor.store.doc!.layers[0]!
        const content = table.type === 'TableLayer' ? table.rows[0]!.cells[0]!.content : null
        expect(content?.type).toBe('TextLayer')
        expect(content?.type === 'TextLayer' && content.expression).toBe('姓名：{{row.name}}')
        expect(content?.type === 'TextLayer' && content.text).toBe('姓名：{{row.name}}')
    })
})

describe('提交未变化短路：对比对象随会话模式（字面对比 text、表达式对比 expression）', () => {
    it('字面会话串与 layer.text 一致：零历史步、零文档通知', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])
        const before = editor.store.doc
        const changes: unknown[] = []
        editor.subscribe((c) => changes.push(c))

        expect(editor.commitTextEdit('你好画布')).toBe(false)

        expect(editor.store.doc).toBe(before)
        expect(editor.store.history).toHaveLength(0)
        expect(changes).toEqual([{ scope: 'ui', branch: 'editing' }])
    })

    it('表达式会话串与 layer.expression 一致（与 text 同值）：零历史步', () => {
        const expression = '姓名：{{row.name}}'
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: expression, expression })],
        })
        editor.beginTextEdit(['layers', 0])

        expect(editor.commitTextEdit(expression)).toBe(false)
        expect(editor.store.history).toHaveLength(0)
        expect(editor.store.ui.editing).toBeNull()
    })

    it('表达式会话对比 layer.expression 而非 text：面板解标后（expression 已 null）同串提交不短路且按片段改标', () => {
        const expression = '姓名：{{row.name}}'
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: expression, expression })],
        })
        editor.beginTextEdit(['layers', 0])
        // 编辑中面板解标：expression → null、text 保持镜像值（本身是面板的一步历史）
        editor.updateDataExpression(['layers', 0], null)
        const historyBeforeCommit = editor.store.history.length

        // 串与镜像 text 一致但与 expression（null）不一致 → 不短路（若错比 text
        // 则零历史步、面板解标残留）；串含合法闭合片段 → updateDataExpression 标记
        // 写（会话模式裁决去向，提交改标）
        expect(editor.commitTextEdit(expression)).toBe(true)
        expect(editor.store.history).toHaveLength(historyBeforeCommit + 1)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe(expression)
        expect(layer.type === 'TextLayer' && layer.expression).toBe(expression)
    })
})

describe('textEditLayout.expressionMode：pill 激活态与补全 enabled 的内核消费面', () => {
    it('字面层 false、标记层 true（无会话时按层标记态回落）', () => {
        const expression = '{{row.name}}'
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10 }), textLayer({ priority: 5, text: expression, expression })],
        })

        expect(editor.textEditLayout(['layers', 0])!.expressionMode).toBe(false)
        expect(editor.textEditLayout(['layers', 1])!.expressionMode).toBe(true)
    })

    it('随会话模式而非层标记态：会话标志翻转后 layout 立即跟随（pill 切换消费面）', () => {
        const expression = '{{row.name}}'
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [textLayer({ priority: 10, text: expression, expression })],
        })
        editor.beginTextEdit(['layers', 0])
        expect(editor.textEditLayout(['layers', 0])!.expressionMode).toBe(true)

        // pill 切换 = 仅改会话标志（ui.editing 原位翻转，零文档变更）
        const editing = editor.store.ui.editing!
        editor.store.setEditing({ ...editing, expression: false })
        expect(editor.textEditLayout(['layers', 0])!.expressionMode).toBe(false)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe(expression)
    })
})

describe('openDocument 清空编辑会话', () => {
    it('换文档不继承旧编辑态', () => {
        const editor = makeEditor(singleTextDoc())
        editor.beginTextEdit(['layers', 0])

        editor.openDocument(singleTextDoc())

        expect(editor.store.ui.editing).toBeNull()
    })
})

describe('textEditLayout：编辑 overlay 的布局描述（与绘制同一套布局策略）', () => {
    it('返回盒几何/排版字段：行高 ceil(字号×行高系数)、top 对齐纵向偏移 0', () => {
        const editor = makeEditor(singleTextDoc())

        const layout = editor.textEditLayout(['layers', 0])

        expect(layout).not.toBeNull()
        expect(layout!.box).toMatchObject({ x: 40, y: 30, width: 100, height: 50 })
        expect(layout!.text).toBe('你好画布')
        expect(layout!.fontSize).toBe(16)
        expect(layout!.lineHeightPx).toBe(20) // ceil(16 × 1.2)
        expect(layout!.horizontalAlign).toBe('left')
        expect(layout!.verticalAnchorY).toBe(0)
        expect(layout!.padding).toEqual({ top: 0, bottom: 0, left: 0, right: 0 })
        expect(layout!.autowrap).toBe(false)
        expect(layout!.font).toBe('')
        expect(layout!.fontColor).toBe('#111827')
    })

    it('center/bottom 纵向锚点对齐 textOrigin 语义（进入时按文档文本计算）', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [
                textLayer({ priority: 10, align: { horizontal: 'center', vertical: 'center' } }),
                textLayer({ priority: 5, align: { horizontal: 'left', vertical: 'bottom' }, shape: { padding: { top: 2, bottom: 3, left: 4, right: 5 } } }),
            ],
        })

        // center：非 autoHeight 单行 → (contentHeight − lineH×(n−1))/2 = 50/2 = 25
        const center = editor.textEditLayout(['layers', 0])!
        expect(center.verticalAnchorY).toBe(25)
        expect(center.verticalAlign).toBe('center')
        // bottom（非 autowrap）：contentHeight = 50 − 2 − 3 = 45
        expect(editor.textEditLayout(['layers', 1])!.verticalAnchorY).toBe(45)
        expect(editor.textEditLayout(['layers', 1])!.padding).toEqual({ top: 2, bottom: 3, left: 4, right: 5 })
    })

    it('表格格内容文本层返回格内绝对盒；非文本/越界路径返回 null', () => {
        const editor = makeEditor({
            width: 400,
            height: 300,
            layers: [tableLayer([rowLayer([
                // 解码契约：格内容宽高与格同步（结构夹具按同值构造）
                cellLayer(textLayer({ priority: 1, shape: { width: 200, height: 60 } }), { shape: { width: 200, height: 60 } }),
            ])])],
        })

        const layout = editor.textEditLayout(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        expect(layout!.box).toMatchObject({ x: 0, y: 0, width: 200, height: 60 })

        expect(editor.textEditLayout(['layers', 0])).toBeNull()
        expect(editor.textEditLayout(['layers', 9])).toBeNull()
    })
})
