/**
 * 模板态表格的预览行会话行为（决策 2026-09）：
 * - previewCanvas：文档衍生视图，模板表实例化一行预览行，文档零改写、memo 引用稳定；
 * - 命中：预览行区域可命中，路径映射回模板子树身份（['rows', 0] → ['template']）；
 * - Escape：模板格 → 表（template 段无选择身份，父级链越过）；
 * - 属性写入：updateSpec 落模板子树，宽度耦合重断言、高度耦合豁免；
 * - 结构编辑：模板子树删除空转（行列增删重排推迟）。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph, type Canvas } from '@hankchen/canvas-next'

import { EditorSession } from '../../src/session/editor'
import { templateTableWire, wireNode, shapeWire } from '../support/fixtures'

const nullScheduler = () => () => {}

const makeSession = (layers: Canvas['layers'], width = 400, height = 300) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width, height, layers })
    return session
}

/** 表 320×120 原点，模板行 320×60，两格 160×60：格 0 带标记文本内容、格 1 空内容 */
const templateLayers = (): Canvas['layers'] =>
    decodeGraph({
        canvas: { width: 400, height: 300 },
        layers: [
            wireNode('TableLayer', shapeWire(320, 120), {
                priority: 10,
                data: { rowsPath: 'order.items' },
                template: wireNode('TableRowTemplate', shapeWire(320, 60), {
                    cells: [
                        wireNode('TableCellLayer', shapeWire(160, 60), {
                            content: wireNode('TextLayer', shapeWire(160, 20), {
                                data: { valueType: 'ExpressionValue', expression: '姓名：{{row.name}}', value: '姓名：{{row.name}}' },
                            }),
                        }),
                        wireNode('TableCellLayer', shapeWire(160, 60), { content: null }),
                    ],
                }),
            }),
        ],
    }).layers

describe('previewCanvas（预览视图 memo）', () => {
    it('模板表在视图中获得预览行；文档 rows 恒空不被改写', () => {
        const session = makeSession(templateLayers())
        const view = session.previewCanvas!
        const viewTable = view.layers[0] as unknown as { rows: unknown[]; template: { cells: unknown[] } }
        expect(viewTable.rows).toHaveLength(1)
        expect(viewTable.rows[0]).toMatchObject({ type: 'TableRowLayer' })
        const docTable = session.store.doc!.layers[0] as unknown as { rows: unknown[] }
        expect(docTable.rows).toHaveLength(0)
    })

    it('doc 未变时引用稳定；事务后视图随 doc 更新', () => {
        const session = makeSession(templateLayers())
        const first = session.previewCanvas
        expect(session.previewCanvas).toBe(first)
        session.updateSpec(['layers', 0], ['shape', 'width'], 300)
        expect(session.previewCanvas).not.toBe(first)
    })

    it('无文档返回 null', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        expect(session.previewCanvas).toBeNull()
    })
})

describe('预览行命中与选中', () => {
    it('预览行格可命中，路径映射回模板子树身份', () => {
        const session = makeSession(templateLayers())
        // 格 0：命中点避开始格内容文本盒（y 0–20），落在格盒下部
        expect(session.selectAt(80, 40)).toEqual(['layers', 0, 'template', 'cells', 0])
        // 格 1（无内容）：直接命中格
        expect(session.selectAt(240, 40)).toEqual(['layers', 0, 'template', 'cells', 1])
        // 预览行下方（表格剩余留白）命中表本身
        expect(session.selectAt(160, 100)).toEqual(['layers', 0])
    })

    it('Escape 升级：模板格 → 表', () => {
        const session = makeSession(templateLayers())
        session.setSelection(['layers', 0, 'template', 'cells', 1])
        session.escapeSelection()
        expect(session.store.ui.selection).toEqual(['layers', 0])
    })
})

describe('模板子树的属性写入', () => {
    it('格宽写入落文档并重断言内容宽耦合；行高不被格高耦合改写（高度豁免）', () => {
        const session = makeSession(templateLayers())
        const cellPath = ['layers', 0, 'template', 'cells', 0] as const
        session.updateSpec(cellPath, ['shape', 'width'], 100)

        const template = (session.store.doc!.layers[0] as unknown as { template: { cells: Array<{ shape: { width: number }; content: { shape: { width: number } } }> } }).template
        expect(template.cells[0]!.shape.width).toBe(100)
        expect(template.cells[0]!.content!.shape.width).toBe(100)
        // 模板行高 60 原样（V1 的「行高取最高格」不适用）
        const table = session.store.doc!.layers[0] as unknown as { template: { shape: { height: number } } }
        expect(table.template.shape.height).toBe(60)
    })

    it('模板格 autoHeight 切换走裸标志写（无采纳语义）', () => {
        const session = makeSession(templateLayers())
        session.updateSpec(['layers', 0, 'template', 'cells', 0], ['shape', 'autoHeight'], true)
        const cell = (session.store.doc!.layers[0] as unknown as { template: { cells: Array<{ shape: { autoHeight: boolean; height: number } }> } }).template.cells[0]!
        expect(cell.shape.autoHeight).toBe(true)
        expect(cell.shape.height).toBe(0)
    })
})

describe('模板子树的结构编辑守卫', () => {
    it('deleteLayer 对模板子树空转；表本身可删', () => {
        const session = makeSession(templateLayers())
        session.deleteLayer(['layers', 0, 'template', 'cells', 0])
        const template = (session.store.doc!.layers[0] as unknown as { template: { cells: unknown[] } }).template
        expect(template.cells).toHaveLength(2)

        session.setSelection(['layers', 0])
        session.deleteLayer(['layers', 0])
        expect(session.store.doc!.layers).toHaveLength(0)
    })
})

describe('fixture 回归：templateTableWire 预览行文本 = 表达式原文', () => {
    it('标记文本格预览直出表达式原文；标记图片格置空走占位', () => {
        const session = makeSession(decodeGraph({ canvas: { width: 400, height: 300 }, layers: [templateTableWire()] }).layers)
        const view = session.previewCanvas!
        const row = (view.layers[0] as unknown as { rows: Array<{ cells: Array<{ content: { type: string; text?: string; src?: string | null; value?: string } }> }> }).rows[0]!
        expect(row.cells[0]!.content).toMatchObject({ type: 'TextLayer', text: '姓名：{{row.name}}' })
        expect(row.cells[1]!.content).toMatchObject({ type: 'ImageLayer', src: null })
        expect(row.cells[2]!.content).toMatchObject({ type: 'QrCodeLayer', value: '' })
    })
})

describe('auto 模板的命中与几何（真实例子回归：行/格/内容全 autoHeight）', () => {
    /** 模板行/格/内容全 autoHeight（声明高被解码归零），与证书例子同构 */
    const autoTemplateLayers = (): Canvas['layers'] =>
        decodeGraph({
            canvas: { width: 995, height: 1464 },
            layers: [
                wireNode('TableLayer', shapeWire(727, 556), {
                    priority: 0,
                    data: { rowsPath: 'chapters' },
                    template: wireNode('TableRowTemplate', shapeWire(727, 0, { autoHeight: true }), {
                        cells: [
                            wireNode('TableCellLayer', shapeWire(727, 0, { autoHeight: true }), {
                                content: wireNode('TextLayer', shapeWire(727, 0, { autoHeight: true, lineHeight: 1.2, padding: { top: 5, bottom: 5, left: 15, right: 15 } }), {
                                    data: { valueType: 'ExpressionValue', expression: "row.seqno~'. '~row.name", value: "row.seqno~'. '~row.name" },
                                }, {
                                    fontFamily: { font: '', fontSize: 18, fontColor: '#222', angle: 0, autowrap: true },
                                }),
                            }),
                        ],
                    }),
                }, { position: { x: 206, y: 678, position: 'top-left' } }),
            ],
        }).layers

    it('预览行按内容动态高合成后可命中：点击落在模板子树', () => {
        const session = makeSession(autoTemplateLayers(), 995, 1464)
        // 行高 = ceil(18×1.2) + 10 = 32：点击 (400, 700)（表内预览行区域）
        const hit = session.selectAt(400, 700)
        expect(hit).toEqual(['layers', 0, 'template', 'cells', 0, 'content'])
    })

    it('模板子树盒几何经视图解析：gizmo 盒为合成高度而非 0', () => {
        const session = makeSession(autoTemplateLayers(), 995, 1464)
        session.setSelection(['layers', 0, 'template', 'cells', 0])
        const box = session.layerBoxAt(['layers', 0, 'template', 'cells', 0])
        expect(box).not.toBeNull()
        expect(box!.height).toBe(32)
        expect(box!.y).toBe(678)
    })
})
