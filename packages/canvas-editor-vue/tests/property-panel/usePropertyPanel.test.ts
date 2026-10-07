import { describe, expect, it, vi } from 'vitest'
import { computed, effectScope, type ComputedRef } from 'vue'

import { EditorSession, createTemplateTable, resolveLayer, type Canvas, type FrameScheduler } from '@hankchen/canvas-editor'

import { cellLayer, rowTemplateLayer, tableLayer } from '../../../canvas-editor/tests/support/fixtures'

import { CANVAS_FIELD_SECTIONS } from '../../src/property-panel/fieldSchema'
import { usePropertyPanel, type FieldDef } from '../../src/property-panel/usePropertyPanel'

/** 同步手动调度器：测试里不真正驱动重绘，只让会话可构造 */
const nullScheduler: FrameScheduler = () => () => {}

const textLayer = (overrides: Record<string, unknown> = {}): Canvas['layers'][number] => ({
    type: 'TextLayer',
    name: '',
    visible: true,
    priority: 10,
    shape: {
        width: 100,
        height: 50,
        autoWidth: false,
        autoHeight: false,
        lineHeight: 1.2,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        border: { top: null, bottom: null, left: null, right: null },
        backgroundColor: null,
    },
    align: { horizontal: 'left', vertical: 'top' },
    position: { anchor: 'top-left', x: 0, y: 0 },
    text: '甲',
    expression: null,
    font: '',
    fontSize: 16,
    fontColor: '#000000',
    angle: 0,
    autowrap: false,
    ...overrides,
})

function makeEditor(layers: Canvas['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

function bind(editor: EditorSession) {
    const scope = effectScope()
    let panel: ReturnType<typeof usePropertyPanel> | null = null
    scope.run(() => {
        panel = usePropertyPanel(editor)
    })
    return { scope, panel: panel! }
}

const X_FIELD: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
const TEXT_FIELD: FieldDef = { key: ['text'], label: '内容', control: 'textarea', data: true }

describe('usePropertyPanel（面板订阅为 computed 切片）', () => {
    it('未打开文档：目标为空、字段组为空', () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        const { scope, panel } = bind(editor)
        expect(panel.canvas.value).toBeNull()
        expect(panel.layer.value).toBeNull()
        expect(panel.sections.value).toEqual([])
        scope.stop()
    })

    it('未选中图层：画布级目标（宽/高字段组），layer 为 null', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        expect(panel.selection.value).toBeNull()
        expect(panel.layer.value).toBeNull()
        expect(panel.sections.value).toEqual(CANVAS_FIELD_SECTIONS)
        expect(panel.canvas.value!.width).toBe(800)
        scope.stop()
    })

    it('选中图层：layer 即路径处领域对象（引用等），字段组按 type/角色过滤', () => {
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 1])
        expect(panel.selection.value).toEqual(['layers', 1])
        expect(panel.layer.value).toBe(resolveLayer(editor.store.doc!, ['layers', 1]))
        const keys = panel.sections.value.flatMap((s) => s.fields.map((f) => f.key.join('.')))
        expect(keys).toContain('text')
        expect(keys).not.toContain('src')
        scope.stop()
    })

    it('无关图层变更：layer 切片引用不变，下游 computed 不重算（结构共享短路）', () => {
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])
        const before = panel.layer.value

        let derivedRuns = 0
        let derived: ComputedRef<number> | null = null
        const scope2 = effectScope()
        scope2.run(() => {
            derived = computed(() => {
                derivedRuns += 1
                return panel!.sections.value.length
            })
        })
        expect(derived!.value).toBeGreaterThan(0)
        const runsAfterSetup = derivedRuns

        editor.store.transact((draft) => {
            const target = draft.layers[1]!
            if (target.type === 'TextLayer') target.text = '改动无关层'
        })
        expect(panel.layer.value).toBe(before) // 切片引用保持
        expect(derivedRuns).toBe(runsAfterSetup) // 下游不重算
        scope2.stop()
        scope.stop()
    })

    it('选中层自身变更：切片引用更新，字段读数联动', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])
        const before = panel.layer.value
        editor.updateSpec(['layers', 0], ['position', 'x'], 55)
        const after = panel.layer.value
        expect(after).not.toBe(before)
        expect(after!.position.x).toBe(55)
        scope.stop()
    })

    it('openDocument 换文档重置：selection 镜像随 doc 通知重读（useSelection 同门）', () => {
        // 两文档同层数：内核重置 selection 后镜像不重读，就会把旧路径解到
        // 新文档同下标的层上——面板给已不被选中的层继续显示表单
        //（canvas-web-layer-lock 工单 03 目验同族第三处收口）
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 1])
        expect(panel.selection.value).toEqual(['layers', 1])

        editor.openDocument({ width: 400, height: 300, layers: [textLayer(), textLayer({ text: '新乙' })] })
        expect(panel.selection.value).toBeNull()
        expect(panel.layer.value).toBeNull()
        scope.stop()
    })
})

describe('commit：面板唯一提交口（分派 updateSpec/updateData/updateCanvasProp）', () => {
    it('spec 字段：写入选中层，final 提交为一步历史', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(X_FIELD, 42, true)

        expect(editor.store.doc!.layers[0]!.position.x).toBe(42)
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('连续 live 提交按字段 mergeKey 合并为一步，final 收口后另起新步', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(X_FIELD, 10, false)
        panel.commit(X_FIELD, 20, false)
        expect(editor.store.history).toHaveLength(1)
        panel.commit(X_FIELD, 30, true) // final：值再变 → 收口
        expect(editor.store.history).toHaveLength(1)

        panel.commit(X_FIELD, 40, false) // 收口后的新会话 → 新步
        expect(editor.store.history).toHaveLength(2)
        expect(editor.store.doc!.layers[0]!.position.x).toBe(40)
        scope.stop()
    })

    it('data 字段走 updateData 分派（TextLayer → text）', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(TEXT_FIELD, '新文案', true)

        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.text).toBe('新文案')
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('标记文本 commit 走 updateDataExpression：编辑镜像字面保持标记（表达式态管线）', () => {
        // spec（canvas-web-expression-marking §2）：表达式态编辑不再解除标记——
        // 逐键 updateDataExpression 改 expression + 镜像，mergeKey 固定 data.expression；
        // 字面写解标的 updateData 语义仍在（静态态管线），由下一条用例锁死
        const expression = '订单 {{orderNo}} · 共 {{$count}} 件'
        const editor = makeEditor([textLayer({ text: expression, expression })])
        const updateData = vi.spyOn(editor, 'updateData')
        const updateDataExpression = vi.spyOn(editor, 'updateDataExpression')
        const updateSpec = vi.spyOn(editor, 'updateSpec')
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(TEXT_FIELD, '订单 {{orderNo}}', true)

        expect(updateDataExpression).toHaveBeenCalledTimes(1)
        expect(updateDataExpression).toHaveBeenCalledWith(['layers', 0], '订单 {{orderNo}}', {
            mergeKey: 'sel:layers.0:data.expression',
        })
        expect(updateData).not.toHaveBeenCalled()
        expect(updateSpec).not.toHaveBeenCalled()
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('订单 {{orderNo}}')
        expect(layer.type === 'TextLayer' && layer.expression).toBe('订单 {{orderNo}}')
        scope.stop()
    })

    it('未标记文本 commit 仍走 updateData：字面写解除标记语义不回归（静态态管线）', () => {
        const editor = makeEditor([textLayer()])
        const updateData = vi.spyOn(editor, 'updateData')
        const updateDataExpression = vi.spyOn(editor, 'updateDataExpression')
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(TEXT_FIELD, '字面文案', true)

        expect(updateData).toHaveBeenCalledTimes(1)
        expect(updateData).toHaveBeenCalledWith(['layers', 0], '字面文案', { mergeKey: 'sel:layers.0:text' })
        expect(updateDataExpression).not.toHaveBeenCalled()
        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.expression).toBeNull()
        scope.stop()
    })

    it('未选中时提交画布级字段（宽/高），live 合步', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        const widthField: FieldDef = { key: ['width'], label: '宽', control: 'number', integer: true }

        panel.commit(widthField, 100, false)
        panel.commit(widthField, 200, false)
        panel.commit(widthField, 300, true)

        expect(editor.store.doc!.width).toBe(300)
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('画布级字段只认 width/height（防御未知键）', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        panel.commit({ key: ['bogus'], label: '?', control: 'number' }, 1, true)
        expect(editor.store.history).toHaveLength(0)
        scope.stop()
    })

    it('无文档时 commit 空转', () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        const { scope, panel } = bind(editor)
        expect(() => panel.commit(X_FIELD, 1, true)).not.toThrow()
        scope.stop()
    })
})

describe('toggleDataMode：数据字段取值方式切换（静态值/表达式）', () => {
    it('静态 → 表达式：初值 = 当前字面原文，一步历史', () => {
        const editor = makeEditor([textLayer({ text: '普通文案' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.toggleDataMode(TEXT_FIELD)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('普通文案')
        expect(layer.type === 'TextLayer' && layer.text).toBe('普通文案')
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('表达式 → 静态：字面接管（值保持现镜像），一步历史', () => {
        const expression = '{{certCode}}'
        const editor = makeEditor([textLayer({ text: expression, expression })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.toggleDataMode(TEXT_FIELD)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
        expect(layer.type === 'TextLayer' && layer.text).toBe(expression)
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('防御：非 data 字段 / 未选中（画布级）/ 值读取失败均空转', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        const specField: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }

        editor.setSelection(['layers', 0])
        panel.toggleDataMode(specField)
        editor.setSelection(null)
        panel.toggleDataMode(TEXT_FIELD)
        expect(editor.store.history).toHaveLength(0)
        scope.stop()
    })
})

describe('位置与尺寸组面板桥（layer-panel-ux 工票 03）', () => {
    it('layerBox：EditorSession.layerBoxAt 的 computed 切片（选中驱动，gizmo 同源）', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        expect(panel.layerBox.value).toBeNull() // 未选中
        editor.setSelection(['layers', 0])
        expect(panel.layerBox.value).toEqual(editor.layerBoxAt(['layers', 0]))
        expect(panel.isPreviewBox.value).toBe(false)
        editor.setSelection(null)
        expect(panel.layerBox.value).toBeNull()
        scope.stop()
    })

    it('isPreviewBox：选中路径含 template 段即预览盒（与内核 isTemplateSubtreePath 同义）', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0, 'template', 'cells', 0, 'content'])
        expect(panel.isPreviewBox.value).toBe(true)
        editor.setSelection(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        expect(panel.isPreviewBox.value).toBe(false)
        scope.stop()
    })

    it('anchorExpanded：store ui 分支投影，setAnchorExpanded 写回（会话记忆）', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        expect(panel.anchorExpanded.value).toBe(false)

        panel.setAnchorExpanded(true)
        expect(panel.anchorExpanded.value).toBe(true)
        expect(editor.store.ui.anchorExpanded).toBe(true)
        expect(editor.store.history).toHaveLength(0) // ui 分支不进历史

        // 面板外直改 store 也回灌投影（同一事实源）
        editor.store.setAnchorExpanded(false)
        expect(panel.anchorExpanded.value).toBe(false)
        scope.stop()
    })
})

describe('选择切换闭合未收口事务', () => {
    it('live 提交后切换选择：开放 mergeKey 自动闭合（卸载丢焦不遗留开放步）', () => {
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])
        panel.commit(X_FIELD, 12, false)
        expect(editor.store.history[0]!.mergeKey).not.toBeNull()

        editor.setSelection(['layers', 1])

        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
        scope.stop()
    })
})

describe('订阅清理', () => {
    it('scope 停止后经 onScopeDispose 注销订阅，退订幂等', () => {
        const editor = makeEditor([])
        const subscribeSpy = vi.spyOn(editor, 'subscribe')
        const scope = effectScope()
        scope.run(() => {
            usePropertyPanel(editor)
        })
        const unsubscribe = subscribeSpy.mock.results[0]!.value
        scope.stop()
        expect(() => unsubscribe()).not.toThrow()
    })
})

describe('rowsPathSource（rows-path-completion 工单 03：行相对候选源）', () => {
    /** 三层嵌套 schema：order.items 行 = name 标量 + lines 数组；lines 行 = sku 标量 + subitems 数组 */
    const RAW_SCHEMA = {
        type: 'object',
        properties: {
            orderNo: { type: 'string' },
            order: {
                type: 'object',
                properties: {
                    items: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                name: { type: 'string' },
                                lines: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            sku: { type: 'string' },
                                            subitems: {
                                                type: 'array',
                                                items: { type: 'object', properties: { title: { type: 'string' } } },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    }

    /** 外层表（order.items）→ 内层表（lines）→ 叶表（subitems） */
    function nestedTableLayer() {
        const leafTable = tableLayer([], { rowsPath: 'subitems', template: rowTemplateLayer([cellLayer(textLayer())]) })
        const innerTable = tableLayer([], { rowsPath: 'lines', template: rowTemplateLayer([cellLayer(leafTable)]) })
        return tableLayer([], { rowsPath: 'order.items', template: rowTemplateLayer([cellLayer(innerTable)]) })
    }

    it('schema 未注入 → null 源（零弹层态）', () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: 'order.items' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])
        expect(panel.rowsPathSource.value).toBeNull()
        scope.stop()
    })

    it('根层表 = 根起点：标量不出、array 候选带「行数组」文案置入', () => {
        const editor = makeEditor([createTemplateTable({ rowsPath: '' })])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        const source = panel.rowsPathSource.value
        if (source === null) throw new Error('schema 注入后应有源')
        const result = source('order.')
        if (result === null) throw new Error('尾点应枚举成功')
        expect(result.partial).toBe('')
        expect(result.candidates.map((c) => c.segment)).toEqual(['items'])
        expect(result.candidates[0]!.type).toBe('行数组')
        scope.stop()
    })

    it('深层嵌套（两个 template 段）：判别件行相对逐级递归到叶起点（标量行键不出）', () => {
        const editor = makeEditor([nestedTableLayer()])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0, 'template', 'cells', 0, 'content', 'template', 'cells', 0, 'content'])

        const source = panel.rowsPathSource.value
        if (source === null) throw new Error('深层嵌套应有源')
        // 叶起点 = 内层行 schema（sku 标量 + subitems 数组）：候选只出 subitems
        const result = source('sub')
        if (result === null) throw new Error('应枚举成功')
        expect(result.candidates.map((c) => c.segment)).toEqual(['subitems'])
        scope.stop()
    })

    it('外层 rowsPath 漂移 → degraded null 源；漂移修复后随 doc 切片联动恢复', () => {
        const drifted = tableLayer([], {
            rowsPath: 'order.missing',
            template: rowTemplateLayer([cellLayer(textLayer())]),
        })
        const editor = makeEditor([drifted])
        editor.setDataSourceSchema(RAW_SCHEMA)
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0, 'template', 'cells', 0, 'content'])
        expect(panel.rowsPathSource.value).toBeNull()

        editor.updateSpec(['layers', 0], ['rowsPath'], 'order.items', { mergeKey: 'fix' })
        const source = panel.rowsPathSource.value
        if (source === null) throw new Error('修复后应有源')
        expect(source('li')?.candidates.map((c) => c.segment)).toEqual(['lines'])
        scope.stop()
    })
})
