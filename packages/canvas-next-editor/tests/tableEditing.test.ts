/**
 * 表格容器结构编辑（工单 12）的内核测试：全部走 EditorSession 公开 action 缝
 * （最高缝，断言外显行为——文档/状态前后与历史），语义逐条平移
 * php-canvas-next TableLayersTest 与 decode 的 addRow/addCell/addContentLayer
 * 副作用清单。
 *
 * 初始文档一律经 decodeGraph 构造（解码副作用已就位的规范形态），
 * 「往返恒等」断言 decodeGraph(encodeGraph(doc)) 深等于编辑后的文档——
 * 任何结构/字段编辑后文档必须保持解码不变量（保存再打开无损）。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph, encodeGraph, type TableLayer, type WireLayerNode } from '@hankchen/canvas-next'

import { EditorSession, type FrameScheduler } from '../src/editor'

const nullScheduler: FrameScheduler = () => () => {}

// ---- canonical wire 造数器：键级对齐 graph() 输出（解码副作用的输入形态） ----

const SHAPE_REST = {
    lineHeight: 1,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    border: { top: null, bottom: null, left: null, right: null },
    backgroundColor: null,
} as const

function shapeWire(width: number, height: number, extra: Record<string, unknown> = {}) {
    return { width, height, autoWidth: false, autoHeight: false, ...SHAPE_REST, ...extra }
}

const ALIGN_TOP_LEFT = { horizontal: 'left' as const, vertical: 'top' as const }
const POSITION_ORIGIN = { x: 0, y: 0, position: 'top-left' as const }

/** 带文本内容的格（内容宽=格宽、内容高=格高：解码压平后的规范形态） */
function cellWire(width: number, height: number, text: string, extra: Record<string, unknown> = {}): WireLayerNode {
    return {
        type: 'TableCellLayer',
        priority: 0,
        spec: { shape: shapeWire(width, height, extra), align: ALIGN_TOP_LEFT, position: POSITION_ORIGIN },
        content: {
            type: 'TextLayer',
            priority: 0,
            spec: {
                shape: shapeWire(width, height),
                align: { horizontal: 'left', vertical: 'bottom' },
                position: POSITION_ORIGIN,
                fontFamily: { font: '', fontSize: 12, fontColor: '#000000', angle: 0, autowrap: false },
            },
            data: { valueType: 'StaticValue', expression: '', value: text },
        },
    }
}

function emptyCellWire(width: number, height: number, extra: Record<string, unknown> = {}): WireLayerNode {
    return {
        type: 'TableCellLayer',
        priority: 0,
        spec: { shape: shapeWire(width, height, extra), align: ALIGN_TOP_LEFT, position: POSITION_ORIGIN },
        content: null,
    }
}

function rowWire(width: number, height: number, cells: WireLayerNode[], extra: Record<string, unknown> = {}): WireLayerNode {
    return {
        type: 'TableRowLayer',
        priority: 0,
        spec: { shape: shapeWire(width, height, extra), align: ALIGN_TOP_LEFT, position: POSITION_ORIGIN },
        cells,
    }
}

function tableWire(width: number, height: number, rows: WireLayerNode[], extra: Record<string, unknown> = {}): WireLayerNode {
    return {
        type: 'TableLayer',
        priority: 10,
        spec: { shape: shapeWire(width, height, extra), align: ALIGN_TOP_LEFT, position: POSITION_ORIGIN },
        rows,
    }
}

/** 打开「单表文档」（经解码，规范形态）；返回会话 */
function openTableDoc(table: WireLayerNode, canvasSize = { width: 800, height: 600 }): EditorSession {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(decodeGraph({ canvas: canvasSize, layers: [table] }))
    return session
}

/** 打开「双表文档」（两张规范表，priority 保证数组序 = 视觉序） */
function openTwoTablesDoc(first: WireLayerNode, second: WireLayerNode): EditorSession {
    const a = { ...first, priority: 20 }
    const b = { ...second, priority: 10 }
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(decodeGraph({ canvas: { width: 800, height: 600 }, layers: [a, b] }))
    return session
}

/** 取第 index 个根层并断言为表（用例内统一收窄，替代逐处 if-return） */
const tableAt = (session: EditorSession, index = 0): TableLayer => {
    const layer = session.store.doc!.layers[index]!
    expect(layer.type).toBe('TableLayer')
    return layer as TableLayer
}

const roundtrips = (session: EditorSession): void => {
    const doc = session.store.doc!
    expect(decodeGraph(encodeGraph(doc))).toEqual(doc)
}

const stepCount = (session: EditorSession): number => session.store.history.length

// ---- 常用文档 ----

/** 单表两行：行0 = 两格(60)文本甲/乙；行1 = 一格(30)文本丙。表 400×90 */
const basicTable = () =>
    tableWire(400, 90, [
        rowWire(400, 60, [cellWire(200, 60, '甲'), cellWire(200, 60, '乙')]),
        rowWire(400, 30, [cellWire(400, 30, '丙')]),
    ])

describe('addTableRow：建行走重建路径（add 同步语义）', () => {
    it('行宽=表宽并关 autoWidth（平移 testAddRowSyncsRowWidthToTableWidth）', () => {
        const session = openTableDoc(basicTable())
        session.addTableRow(['layers', 0])

        const row = tableAt(session).rows[2]!
        expect(row.shape.width).toBe(400)
        expect(row.shape.autoWidth).toBe(false)
    })

    it('新行带缺省格与文本内容：内容宽=格宽、固定格压平内容高并关内容 autoHeight（平移 testFixedCellFlattensContentHeight）', () => {
        const session = openTableDoc(basicTable())
        session.addTableRow(['layers', 0])

        const table = tableAt(session, 0)
        const cell = table.rows[2]!.cells[0]!
        expect(cell.type).toBe('TableCellLayer')
        expect(cell.content?.type).toBe('TextLayer')
        expect(cell.content?.shape.width).toBe(cell.shape.width)
        expect(cell.content?.shape.autoWidth).toBe(false)
        // 缺省行/格同高 60：内容高被压平到格高，autoHeight 固化
        expect(cell.shape.height).toBe(60)
        expect(cell.content?.shape.height).toBe(60)
        expect(cell.content?.shape.autoHeight).toBe(false)
    })

    it('首格宽=行宽；一次调用=一步历史，undo 整行移除', () => {
        const session = openTableDoc(tableWire(400, 60, []))
        session.addTableRow(['layers', 0])

        const table = tableAt(session, 0)
        expect(table.rows).toHaveLength(1)
        expect(table.rows[0]!.cells[0]!.shape.width).toBe(400)
        expect(stepCount(session)).toBe(1)

        session.undo()
        const after = tableAt(session, 0)
        expect(after.rows).toHaveLength(0)
        expect(stepCount(session)).toBe(0)
    })

    it('自动选中新行；撤销后悬空选择清空', () => {
        const session = openTableDoc(basicTable())
        session.addTableRow(['layers', 0])
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 2])

        session.undo()
        expect(session.store.ui.selection).toBeNull()
    })

    it('auto 行加格后固化：行高取最高格并关 autoHeight（解码 addCell 语义镜像）', () => {
        // 解码保留「无格 auto 行」（height 0 + autoHeight true 是规范形态）
        const session = openTableDoc(tableWire(400, 60, [rowWire(400, 0, [], { autoHeight: true })]))
        const before = tableAt(session, 0)
        expect(before.rows[0]!.shape.autoHeight).toBe(true)

        session.addTableCell(['layers', 0, 'rows', 0])
        const table = tableAt(session, 0)
        expect(table.rows[0]!.shape.height).toBe(60)
        expect(table.rows[0]!.shape.autoHeight).toBe(false)
        roundtrips(session)
    })

    it('往返恒等：建行后的文档 decode(encode) 深等', () => {
        const session = openTableDoc(basicTable())
        session.addTableRow(['layers', 0])
        roundtrips(session)
    })
})

describe('addTableCell：建格走重建路径（add 同步语义）', () => {
    it('行高取最高单元格（平移 testAddCellGrowsRowHeightToTallest）', () => {
        // 行高 30（格 30），缺省新格高 60 → 行增长到 60
        const session = openTableDoc(tableWire(400, 90, [rowWire(400, 30, [cellWire(400, 30, '丙')])]))
        session.addTableCell(['layers', 0, 'rows', 0])

        const table = tableAt(session, 0)
        expect(table.rows[0]!.shape.height).toBe(60)
        expect(table.rows[0]!.shape.autoHeight).toBe(false)
    })

    it('格宽随末格宽（均齐直觉）；首格取行宽', () => {
        const session = openTableDoc(basicTable())
        session.addTableCell(['layers', 0, 'rows', 0])
        const table = tableAt(session, 0)
        expect(table.rows[0]!.cells[2]!.shape.width).toBe(200)
        expect(table.rows[0]!.cells[2]!.content?.shape.width).toBe(200)

        const empty = openTableDoc(tableWire(400, 60, [rowWire(400, 60, [])]))
        empty.addTableCell(['layers', 0, 'rows', 0])
        const emptyTable = tableAt(empty, 0)
        expect(emptyTable.rows[0]!.cells[0]!.shape.width).toBe(400)
    })

    it('自动选中新格；一次调用=一步历史可撤销；往返恒等', () => {
        const session = openTableDoc(basicTable())
        session.addTableCell(['layers', 0, 'rows', 0])
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 2])
        expect(stepCount(session)).toBe(1)
        roundtrips(session)

        session.undo()
        const table = tableAt(session, 0)
        expect(table.rows[0]!.cells).toHaveLength(2)
        expect(table.rows[0]!.shape.height).toBe(60)
    })
})

describe('add 同步的不重算面（先 add 后改尺寸，镜像解码重断言集）', () => {
    it('收缩格高不回缩行高、内容高重压平（解码只增长行高、恒同步内容高）', () => {
        const session = openTableDoc(basicTable())
        session.updateSpec(['layers', 0, 'rows', 0, 'cells', 0], ['shape', 'height'], 20)

        const table = tableAt(session, 0)
        expect(table.rows[0]!.shape.height).toBe(60) // 行高不重算（不收缩）
        const cell = table.rows[0]!.cells[0]!
        expect(cell.shape.height).toBe(20)
        expect(cell.content?.shape.height).toBe(20) // 固定格内容高恒=格高（解码强同步）
        roundtrips(session)
    })

    it('增高格超过行高 → 行高跟随增长（解码不变量，往返恒等要求）', () => {
        const session = openTableDoc(basicTable())
        session.updateSpec(['layers', 0, 'rows', 0, 'cells', 0], ['shape', 'height'], 80)

        const table = tableAt(session, 0)
        expect(table.rows[0]!.shape.height).toBe(80)
        expect(table.rows[0]!.cells[0]!.content?.shape.height).toBe(80)
        roundtrips(session)
    })

    it('表宽写入 → 全部行宽重同步（行宽=表宽的解码强同步镜像）', () => {
        const session = openTableDoc(basicTable())
        session.updateSpec(['layers', 0], ['shape', 'width'], 600)

        const table = tableAt(session, 0)
        expect(table.shape.width).toBe(600)
        expect(table.rows.map((row) => row.shape.width)).toEqual([600, 600])
        roundtrips(session)
    })

    it('行 autoHeight 写入走解码归一：空行标志保留（高归零）、带格行被行高取最高格固化', () => {
        const session = openTableDoc(tableWire(400, 60, [
            rowWire(400, 0, [], { autoHeight: true }), // 空行：解码保留 auto 标志的规范形态
            rowWire(400, 30, [cellWire(400, 30, '丙')]),
        ]))
        // 空行开：置标志 + 声明高归零
        session.updateSpec(['layers', 0, 'rows', 0], ['shape', 'autoHeight'], true)
        const emptyRow = tableAt(session).rows[0]!
        expect(emptyRow.shape.autoHeight).toBe(true)
        expect(emptyRow.shape.height).toBe(0)
        // 带格行开：行高取最高格的解码不变量胜出——增长并固化（关 autoHeight）
        session.updateSpec(['layers', 0, 'rows', 1], ['shape', 'autoHeight'], true)
        const filledRow = tableAt(session).rows[1]!
        expect(filledRow.shape.autoHeight).toBe(false)
        expect(filledRow.shape.height).toBe(30)
        roundtrips(session)
    })

    it('表 autoHeight 写入 = 标志置位且声明高归零（decodeBase 归一镜像，往返恒等）', () => {
        const session = openTableDoc(basicTable())
        session.updateSpec(['layers', 0], ['shape', 'autoHeight'], true)

        expect(tableAt(session).shape.autoHeight).toBe(true)
        expect(tableAt(session).shape.height).toBe(0)
        roundtrips(session)
    })

    it('行宽直写被覆写回表宽、行高直写低于最高格回弹（强同步字段不可编辑）', () => {
        const session = openTableDoc(basicTable())
        session.updateSpec(['layers', 0, 'rows', 0], ['shape', 'width'], 123)
        session.updateSpec(['layers', 0, 'rows', 0], ['shape', 'height'], 5)

        const table = tableAt(session, 0)
        expect(table.rows[0]!.shape.width).toBe(400)
        expect(table.rows[0]!.shape.autoWidth).toBe(false)
        expect(table.rows[0]!.shape.height).toBe(60) // max(行内格高 60) > 5 → 回弹
        roundtrips(session)
    })
})

describe('moveTableCell：同行格重排（数组序语义）', () => {
    it('直接改 cells 数组序，几何跟随（格0恒在最左），行/格 priority 不参与', () => {
        const session = openTableDoc(basicTable())
        session.moveTableCellToRow(['layers', 0, 'rows', 0, 'cells', 0], ['layers', 0, 'rows', 0], 2)

        const table = tableAt(session, 0)
        const texts = table.rows[0]!.cells.map((cell) => (cell.content?.type === 'TextLayer' ? cell.content.text : ''))
        expect(texts).toEqual(['乙', '甲'])
        expect(table.rows[0]!.cells[0]!.priority).toBe(0) // priority 原样搬移

        // 几何：格0 的盒恒在行内最左（与绘制模板同一推进公式）
        roundtrips(session)
        const box = session.layerBoxAt(['layers', 0, 'rows', 0, 'cells', 0])
        expect(box).toEqual({
            x: 0,
            y: 0,
            width: 200,
            height: 60,
            contentX: 0,
            contentY: 0,
            contentWidth: 200,
            contentHeight: 60,
        })
    })

    it('原位/相邻落点空转（无历史步）；一次调用=一步历史可撤销', () => {
        const session = openTableDoc(basicTable())
        session.moveTableCellToRow(['layers', 0, 'rows', 0, 'cells', 0], ['layers', 0, 'rows', 0], 1)
        expect(stepCount(session)).toBe(0)

        session.moveTableCellToRow(['layers', 0, 'rows', 0, 'cells', 0], ['layers', 0, 'rows', 0], 2)
        expect(stepCount(session)).toBe(1)

        session.undo()
        const table = tableAt(session, 0)
        const texts = table.rows[0]!.cells.map((cell) => (cell.content?.type === 'TextLayer' ? cell.content.text : ''))
        expect(texts).toEqual(['甲', '乙'])
    })

    it('格内后代的选择路径跟随重映射', () => {
        const session = openTableDoc(basicTable())
        session.setSelection(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        session.moveTableCellToRow(['layers', 0, 'rows', 0, 'cells', 0], ['layers', 0, 'rows', 0], 2)
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 1, 'content'])
    })
})

describe('moveTableCellToRow：跨行移动（重建路径）', () => {
    /** 行0 = 一格(30)甲；行1 = 两格(60)乙/丙，行高 80（高于格，验证不收缩） */
    const twoRowTable = () =>
        tableWire(400, 110, [
            rowWire(400, 30, [cellWire(400, 30, '甲')]),
            rowWire(400, 80, [cellWire(200, 60, '乙'), cellWire(200, 60, '丙')]),
        ])

    it('目标行高取最高格（addCell 重建语义）；源行高不动（不重算）', () => {
        const session = openTableDoc(twoRowTable())
        session.moveTableCellToRow(['layers', 0, 'rows', 1, 'cells', 0], ['layers', 0, 'rows', 0], 1)

        const table = tableAt(session, 0)
        expect(table.rows[0]!.shape.height).toBe(60) // max(30, 60)
        expect(table.rows[1]!.shape.height).toBe(80) // 源行不收缩
        const texts = table.rows[0]!.cells.map((cell) => (cell.content?.type === 'TextLayer' ? cell.content.text : ''))
        expect(texts).toEqual(['甲', '乙'])
    })

    it('内容层归属随格：内容仍在格内且宽=格宽、高被压平（重同步幂等）', () => {
        const session = openTableDoc(twoRowTable())
        session.moveTableCellToRow(['layers', 0, 'rows', 1, 'cells', 0], ['layers', 0, 'rows', 0], 0)

        const table = tableAt(session, 0)
        const moved = table.rows[0]!.cells[0]!
        expect(moved.content?.type).toBe('TextLayer')
        expect(moved.content?.shape.width).toBe(moved.shape.width)
        expect(moved.content?.shape.height).toBe(moved.shape.height)
        expect(moved.content?.shape.autoWidth).toBe(false)
    })

    it('选择跟随；undo 完整还原；往返恒等', () => {
        const session = openTableDoc(twoRowTable())
        session.setSelection(['layers', 0, 'rows', 1, 'cells', 0])
        session.moveTableCellToRow(['layers', 0, 'rows', 1, 'cells', 0], ['layers', 0, 'rows', 0], 0)
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 0])
        expect(stepCount(session)).toBe(1)
        roundtrips(session)

        session.undo()
        const table = tableAt(session, 0)
        expect(table.rows[0]!.cells).toHaveLength(1)
        expect(table.rows[0]!.shape.height).toBe(30)
        expect(table.rows[1]!.cells.map((cell) => (cell.content?.type === 'TextLayer' ? cell.content.text : ''))).toEqual([
            '乙',
            '丙',
        ])
    })
})

describe('moveTableRowToTable：跨表移动（重建路径）', () => {
    /** 表A(400宽)：一行两格；表B(600宽)：一行一格 */
    const twoTables = (): [WireLayerNode, WireLayerNode] => [
        tableWire(400, 60, [rowWire(400, 60, [cellWire(200, 60, '甲'), cellWire(200, 60, '乙')])]),
        tableWire(600, 30, [rowWire(600, 30, [cellWire(600, 30, '丙')])]),
    ]

    it('行宽同步目标表宽（addRow 重建语义）；行内格与内容原样随行', () => {
        const [a, b] = twoTables()
        const session = openTwoTablesDoc(a, b)
        // 表B 在数组 [1]；把表A 的行0 拖到表B 行0 的下半（insert-after → to=1）
        session.moveTableRowToTable(['layers', 0, 'rows', 0], ['layers', 1], 1)

        const target = tableAt(session, 1)
        expect(target.rows).toHaveLength(2)
        expect(target.rows[1]!.shape.width).toBe(600)
        expect(target.rows[1]!.shape.autoWidth).toBe(false)
        expect(target.rows[1]!.cells).toHaveLength(2)
        const texts = target.rows[1]!.cells.map((cell) => (cell.content?.type === 'TextLayer' ? cell.content.text : ''))
        expect(texts).toEqual(['甲', '乙'])

        const source = tableAt(session, 0)
        expect(source.rows).toHaveLength(0)
    })

    it('选择跟随（含格内后代）；undo；往返恒等', () => {
        const [a, b] = twoTables()
        const session = openTwoTablesDoc(a, b)
        session.setSelection(['layers', 0, 'rows', 0, 'cells', 1])
        session.moveTableRowToTable(['layers', 0, 'rows', 0], ['layers', 1], 0)
        expect(session.store.ui.selection).toEqual(['layers', 1, 'rows', 0, 'cells', 1])
        expect(stepCount(session)).toBe(1)
        roundtrips(session)

        session.undo()
        const source = tableAt(session, 0)
        expect(source.rows).toHaveLength(1)
        expect(session.store.ui.selection).toBeNull() // 撤销后原路径悬空 → 清空
    })
})

describe('setCellAutoHeight：格 autoHeight 切换（采纳/固化语义）', () => {
    /** autowrap 文本格：宽 50，内容 '甲乙丙丁戊'（每字 12px → 2 行），行高 1 */
    const autowrapCellTable = () => {
        const wire = tableWire(200, 40, [
            rowWire(200, 40, [cellWire(50, 40, '甲乙丙丁戊')]),
        ])
        // 内容改 autowrap：解码后内容高压平为格高（40），切换时按动态高采纳
        const cell = (wire.rows as WireLayerNode[])[0]!.cells as WireLayerNode[]
        const content = cell[0]!.content as WireLayerNode
        content.spec = {
            ...content.spec,
            shape: shapeWire(50, 40),
            fontFamily: { font: '', fontSize: 12, fontColor: '#000000', angle: 0, autowrap: true },
        }
        return wire
    }

    it('开且带 autowrap 文本：盒高=行数×行高+padding（2行×12=24），标志固化（往返恒等）', () => {
        const session = openTableDoc(autowrapCellTable())
        session.setCellAutoHeight(['layers', 0, 'rows', 0, 'cells', 0], true)

        const table = tableAt(session, 0)
        const cell = table.rows[0]!.cells[0]!
        expect(cell.shape.height).toBe(24)
        expect(cell.shape.autoHeight).toBe(false) // 带内容的格解码恒归一固定高
        roundtrips(session)
    })

    it('采纳增高 → 行高取最高格跟随；undo 还原', () => {
        // 三行文本（36px）高于行高 30 → 行增长
        const wire = tableWire(200, 30, [rowWire(200, 30, [cellWire(50, 30, '甲乙丙丁戊己庚辛壬癸')])])
        const cells = (wire.rows as WireLayerNode[])[0]!.cells as WireLayerNode[]
        const content = cells[0]!.content as WireLayerNode
        content.spec = {
            ...content.spec,
            shape: shapeWire(50, 30),
            fontFamily: { font: '', fontSize: 12, fontColor: '#000000', angle: 0, autowrap: true },
        }
        const session = openTableDoc(wire)
        session.setCellAutoHeight(['layers', 0, 'rows', 0, 'cells', 0], true)

        const table = tableAt(session, 0)
        expect(table.rows[0]!.cells[0]!.shape.height).toBe(36)
        expect(table.rows[0]!.shape.height).toBe(36)
        expect(stepCount(session)).toBe(1)

        session.undo()
        const restored = tableAt(session, 0)
        expect(restored.rows[0]!.shape.height).toBe(30)
        expect(restored.rows[0]!.cells[0]!.shape.height).toBe(30)
    })

    it('空格开 = 置标志且声明高归零（解码对 auto 恒清零）；关 = 清标志；往返恒等', () => {
        const session = openTableDoc(tableWire(200, 40, [rowWire(200, 40, [emptyCellWire(50, 40)])]))
        const cellPath = ['layers', 0, 'rows', 0, 'cells', 0]

        session.setCellAutoHeight(cellPath, true)
        let table = tableAt(session)
        expect(table.rows[0]!.cells[0]!.shape.autoHeight).toBe(true)
        expect(table.rows[0]!.cells[0]!.shape.height).toBe(0) // auto 标志的解码归一形态
        roundtrips(session)

        session.setCellAutoHeight(cellPath, false)
        table = tableAt(session)
        expect(table.rows[0]!.cells[0]!.shape.autoHeight).toBe(false)
    })

    it('属性面板布尔控件的直通路径：updateSpec(shape.autoHeight) 走同一采纳收口', () => {
        const session = openTableDoc(autowrapCellTable())
        session.updateSpec(['layers', 0, 'rows', 0, 'cells', 0], ['shape', 'autoHeight'], true)

        const table = tableAt(session, 0)
        expect(table.rows[0]!.cells[0]!.shape.height).toBe(24)
        expect(table.rows[0]!.cells[0]!.shape.autoHeight).toBe(false)
    })
})

describe('表格级联选中与结构编辑协同', () => {
    it('删除选中行 → 选择清空（不悬挂）', () => {
        const session = openTableDoc(basicTable())
        session.setSelection(['layers', 0, 'rows', 1])
        session.deleteLayer(['layers', 0, 'rows', 1])
        expect(session.store.ui.selection).toBeNull()

        const table = tableAt(session, 0)
        expect(table.rows).toHaveLength(1)
    })

    it('删除选中行之前的行 → 选择重映射到正确行', () => {
        const session = openTableDoc(basicTable())
        session.setSelection(['layers', 0, 'rows', 1])
        session.deleteLayer(['layers', 0, 'rows', 0])
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0])
    })

    it('删除格 → 行内格下标重映射；选中该格内容则清空', () => {
        const session = openTableDoc(basicTable())
        session.setSelection(['layers', 0, 'rows', 0, 'cells', 1])
        session.deleteLayer(['layers', 0, 'rows', 0, 'cells', 0])
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 0])

        session.setSelection(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        session.deleteLayer(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        expect(session.store.ui.selection).toBeNull()
        const table = tableAt(session, 0)
        expect(table.rows[0]!.cells[0]!.content).toBeNull()
    })
})

describe('单元格内容层编辑复用 09/11 能力', () => {
    it('commitTextEdit 落在格内容层：文本更新、恰好一步历史', () => {
        const session = openTableDoc(basicTable())
        const contentPath = ['layers', 0, 'rows', 0, 'cells', 0, 'content']

        expect(session.beginTextEdit(contentPath)).toBe(true)
        expect(session.store.ui.editing).toEqual({ path: contentPath })
        expect(session.commitTextEdit('新文本')).toBe(true)

        const table = tableAt(session, 0)
        const content = table.rows[0]!.cells[0]!.content
        expect(content?.type === 'TextLayer' && content.text).toBe('新文本')
        expect(stepCount(session)).toBe(1)
        session.undo()
        const restored = tableAt(session, 0)
        expect(restored.rows[0]!.cells[0]!.content?.type === 'TextLayer' && restored.rows[0]!.cells[0]!.content.text).toBe('甲')
    })

    it('格内容空文本提交 = 内容置 null（复用 deleteLayer 语义），可撤销', () => {
        const session = openTableDoc(basicTable())
        const contentPath = ['layers', 0, 'rows', 0, 'cells', 0, 'content']
        session.beginTextEdit(contentPath)
        session.commitTextEdit('')

        const table = tableAt(session, 0)
        expect(table.rows[0]!.cells[0]!.content).toBeNull()
        session.undo()
        const restored = tableAt(session, 0)
        expect(restored.rows[0]!.cells[0]!.content).not.toBeNull()
    })

    it('updateSpec 走内容层路径：fontSize 更新、内容高保持压平（解码强同步）', () => {
        const session = openTableDoc(basicTable())
        session.updateSpec(['layers', 0, 'rows', 0, 'cells', 0, 'content'], ['fontSize'], 20)

        const table = tableAt(session, 0)
        const content = table.rows[0]!.cells[0]!.content
        expect(content?.type === 'TextLayer' && content.fontSize).toBe(20)
        expect(content?.shape.height).toBe(60) // 压平保持
        roundtrips(session)
    })
})
