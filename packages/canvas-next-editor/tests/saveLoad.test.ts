/**
 * 保存→打开往返（工单 13）：编辑后的 graph JSON 重新打开无信息丢失。
 *
 * 与 canvas-next 包的 wire 往返恒等测试的差异：这里在**真实编辑产物**上验证——
 * 文档经 EditorSession 的全套编辑动作（属性写入/数据写入/结构增删重排/表格
 * 行列/拖动）产出，再 encodeGraph → decodeGraph → encodeGraph 断言字节级恒等。
 * 保存（宿主）= encodeGraph 的 JSON 文件；打开 = decodeGraph，恒等即无损复原。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph, encodeGraph } from '@hankchen/canvas-next'

import { EditorSession } from '../src/editor'
import { shapeWire, templateTableWire, wireNode } from './support/fixtures'

const syncScheduler = (callback: () => void) => {
    callback()
    return () => {}
}

/** 起始文档：手写宽松 wire（含字符串数字/缺键），演练真实打开场景 */
const START_WIRE = {
    canvas: { width: 1200, height: 800 },
    layers: [
        {
            type: 'ImageLayer',
            priority: '30',
            spec: {
                shape: { width: 1200, height: 800, backgroundColor: '#f8fafc' },
                position: { x: 0, y: 0, position: 'top-left' },
            },
        },
        {
            type: 'TextLayer',
            priority: 20,
            spec: {
                shape: { width: 400, height: 60 },
                position: { x: 100, y: 100, position: 'top-left' },
                fontFamily: { fontSize: '32', fontColor: '#0f172a' },
            },
            data: { valueType: 'StaticValue', value: '标题' },
        },
    ],
}

describe('保存→打开：真实编辑产物的往返恒等', () => {
    it('属性/数据/结构/表格/拖动编辑后的 encode→decode→encode 字节级恒等', () => {
        const editor = new EditorSession({ scheduleFrame: syncScheduler })
        editor.openDocument(decodeGraph(START_WIRE))

        // 属性写入（含数值/锚点/对齐/形状/边框等字段路径）
        editor.updateSpec(['layers', 1], ['position', 'x'], 160)
        editor.updateSpec(['layers', 1], ['position', 'anchor'], 'center')
        editor.updateSpec(['layers', 1], ['fontSize'], 48)
        editor.updateSpec(['layers', 1], ['font'], '/fonts/open-sans.ttf')
        editor.updateSpec(['layers', 1], ['autowrap'], true)
        editor.updateSpec(['layers', 1], ['shape', 'backgroundColor'], '#fef3c7')
        editor.updateSpec(['layers', 1], ['shape', 'padding'], { top: 8, bottom: 8, left: 12, right: 12 })
        editor.updateSpec(['layers', 1], ['shape', 'border'], {
            top: { width: 1, color: '#f59e0b' },
            bottom: null,
            left: null,
            right: null,
        })
        editor.updateData(['layers', 1], '标题·编辑后')

        // 画布级字段
        editor.updateCanvasProp('width', 1280)

        // 结构编辑：新增各类型图层（新层落数组尾 = 视觉最上）
        editor.addRootLayer('ImageLayer')
        editor.updateData(['layers', 2], 'https://cdn.example.com/photo.png')
        editor.updateSpec(['layers', 2], ['shape', 'width'], 320)
        editor.updateSpec(['layers', 2], ['shape', 'height'], 240)
        editor.addRootLayer('QrCodeLayer')
        editor.updateData(['layers', 3], 'https://canvas.example/join')
        editor.addRootLayer('TableLayer')
        const tablePath = ['layers', 4]
        editor.addTableRow(tablePath)
        editor.addTableRow(tablePath)
        editor.addTableCell([...tablePath, 'rows', 0])
        editor.addTableCell([...tablePath, 'rows', 0])
        editor.updateData([...tablePath, 'rows', 0, 'cells', 0, 'content'], '单元格')

        // 重排与删除（根层中点插值 + 行数组序 + 跨容器移动）
        editor.moveRootLayer(0, 2)
        editor.moveTableRow(tablePath, 1, 0)
        editor.moveTableCellToRow(
            [...tablePath, 'rows', 0, 'cells', 0],
            [...tablePath, 'rows', 1],
            0,
        )
        editor.deleteLayer(['layers', 0])

        // 拖动（mergeKey 事务合并语义下的位置编辑）
        editor.beginDrag(['layers', 3], 500, 400)
        editor.dragTo(620, 380)
        editor.endDrag()

        // 编辑后的领域文档 → 保存产物（canonical wire JSON）
        const saved = JSON.stringify(encodeGraph(editor.store.doc!))

        // 打开：decode → 再 encode，字节级恒等即无损复原
        const reopened = JSON.stringify(encodeGraph(decodeGraph(JSON.parse(saved))))
        expect(reopened).toBe(saved)

        // 领域结构也逐字段一致（打开后的文档可继续编辑同一套动作）
        expect(decodeGraph(JSON.parse(saved))).toEqual(editor.store.doc)
    })

    it('打开文件即 clean 基线：原样打开不再编辑时保存产物与打开产物一致', () => {
        const editor = new EditorSession({ scheduleFrame: syncScheduler })
        editor.openDocument(decodeGraph(START_WIRE))
        const saved = JSON.stringify(encodeGraph(editor.store.doc!))
        const reopened = JSON.stringify(encodeGraph(decodeGraph(JSON.parse(saved))))
        expect(reopened).toBe(saved)
    })
})

describe('模板态保存→打开（工票 02）：编辑不产非法 wire、往返不丢数据', () => {
    const openTemplateDoc = () => {
        const editor = new EditorSession({ scheduleFrame: syncScheduler })
        editor.openDocument(decodeGraph({ canvas: { width: 800, height: 600 }, layers: [templateTableWire()] }))
        return editor
    }

    it('模板态图 encode→decode→encode 恒等（原样打开零编辑）', () => {
        const editor = openTemplateDoc()
        const saved = JSON.stringify(encodeGraph(editor.store.doc!))
        const reopened = JSON.stringify(encodeGraph(decodeGraph(JSON.parse(saved))))
        expect(reopened).toBe(saved)
    })

    it('编辑序列（改表宽/编辑标记文本）后保存：仍合法（无 template+rows 双键）且往返恒等', () => {
        const editor = new EditorSession({ scheduleFrame: syncScheduler })
        editor.openDocument(
            decodeGraph({
                canvas: { width: 800, height: 600 },
                // 模板表 + 画布级标记文本（行模板子树不可寻址，可编辑的标记层在根层）
                layers: [
                    templateTableWire(),
                    wireNode('TextLayer', shapeWire(200, 40), {
                        priority: 5,
                        data: { valueType: 'ExpressionValue', expression: '全局：{{orderNo}}', value: '全局：{{orderNo}}' },
                    }, {
                        fontFamily: { font: '', fontSize: 12, fontColor: '#000000', angle: 0, autowrap: false },
                    }),
                ],
            }),
        )
        editor.updateSpec(['layers', 0], ['shape', 'width'], 500)
        editor.updateData(['layers', 1], '全局：字面')

        const saved = JSON.stringify(encodeGraph(editor.store.doc!))

        // 合法性：模板态 wire 不落 rows 键（XOR）；表宽重断言已同步到行模板；
        // 被编辑的标记文本退化为字面态，模板内标记层原样
        const layers = JSON.parse(saved).layers as Record<string, unknown>[]
        const table = layers.find((layer) => layer.type === 'TableLayer')!
        expect(table.rows).toBeUndefined()
        expect(table.template).toBeDefined()
        expect((table.data as Record<string, unknown>).rowsPath).toBe('order.items')
        const template = table.template as { spec: { shape: { width: number } }; cells: Record<string, unknown>[] }
        expect(template.spec.shape.width).toBe(500)
        const markedData = ((template.cells[1] as { content: { data: Record<string, unknown> } }).content).data
        expect(markedData.valueType).toBe('ExpressionValue')
        const editText = layers.find((layer) => layer.type === 'TextLayer')!
        expect((editText.data as Record<string, unknown>).valueType).toBe('StaticValue')

        const reopened = JSON.stringify(encodeGraph(decodeGraph(JSON.parse(saved))))
        expect(reopened).toBe(saved)
    })

    it('模板态 addTableRow 拒绝后保存：wire 形态与打开产物一致（守卫不产中间态）', () => {
        const editor = openTemplateDoc()
        editor.addTableRow(['layers', 0])

        const saved = JSON.stringify(encodeGraph(editor.store.doc!))
        const reopened = JSON.stringify(encodeGraph(decodeGraph(JSON.parse(saved))))
        expect(reopened).toBe(saved)
        const table = (JSON.parse(saved).layers as Record<string, unknown>[])[0]!
        expect(table.rows).toBeUndefined()
    })
})
