/**
 * 剪贴板与置顶/置底（工单 14）：复制/粘贴/创建副本的内核语义。
 *
 * - 复制捕获选中层的子树深拷贝（会话级剪贴板，不碰 OS 剪贴板）；可复制类型 =
 *   可落根层的类型（文/图/码/表）——行/格是容器内结构，v1 不可复制（置顶/置底
 *   同为根层语义）；格内容（文本/图片/码）可复制，粘贴落为根层。
 * - 粘贴 = 子树深拷贝插入根层：置顶（priority = min−1，数组尾 = 视觉最上层）、
 *   位置偏移不与原件重叠（同一剪贴板条目连续粘贴偏移递增）、自动选中新层、
 *   一次调用 = 一步历史（可撤销）；副本 = 复制态 + 固定偏移，不覆盖剪贴板。
 * - 往返恒等：粘贴产物是解码规范化状态的克隆 + 整数偏移/整数 priority，
 *   encode→decode→encode 仍字节级恒等。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph, encodeGraph } from '@hankchen/canvas-next'

import { EditorSession } from '../../src/session/editor'
import type { FrameScheduler } from '../../src/session/editor'
import { cellLayer, imageLayer, rowLayer, tableLayer, templateTableWire, textLayer } from '../support/fixtures'
import type { Layer, TableLayer, TextLayer } from '@hankchen/canvas-next'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (layers: readonly Layer[]) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers: [...layers] })
    return session
}

const select = (session: ReturnType<typeof makeSession>, path: readonly (string | number)[] | null) =>
    session.setSelection(path as never)

const positions = (session: ReturnType<typeof makeSession>) =>
    session.store.doc!.layers.map((layer) => `${layer.position.x},${layer.position.y}`)

/** 表：一行两格，首格含文本内容层（子树深拷贝的下钻覆盖） */
const tableWithCells = (overrides: { priority?: number; x?: number; y?: number } = {}): TableLayer =>
    tableLayer(
        [
            rowLayer(
                [
                    cellLayer(textLayer({ text: '甲', fontColor: '#123456' }), { shape: { width: 200, height: 80 } }),
                    cellLayer(null, { shape: { width: 200, height: 80 } }),
                ],
                { shape: { width: 400, height: 80 } },
            ),
        ],
        {
            priority: overrides.priority ?? 20,
            position: { x: overrides.x ?? 40, y: overrides.y ?? 30 },
        },
    )

describe('copySelection / pasteFromClipboard：子树深拷贝 + 置顶 + 偏移', () => {
    it('粘贴为新根层：数组尾（视觉最上层）、priority = min−1、位置偏移 +20、自动选中', () => {
        const session = makeSession([
            textLayer({ priority: 30, text: '底', position: { x: 0, y: 0 } }),
            textLayer({ priority: 10, text: '顶', position: { x: 100, y: 100 } }),
        ])
        select(session, ['layers', 1])

        expect(session.copySelection()).toBe(true)
        const pasted = session.pasteFromClipboard()
        expect(pasted).toEqual(['layers', 2])
        expect(session.store.ui.selection).toEqual(['layers', 2])

        const doc = session.store.doc!
        expect(doc.layers).toHaveLength(3)
        const copy = doc.layers[2] as TextLayer
        expect(copy.text).toBe('顶')
        expect(copy.priority).toBe(9) // min(30,10) − 1，置顶
        expect(copy.position.x).toBe(120) // 100 + 20：与原件不重叠
        expect(copy.position.y).toBe(120)
    })

    it('空画布粘贴：priority 取 0（复制 → 删源清空画布 → 剪贴板仍在）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        select(session, ['layers', 0])
        expect(session.copySelection()).toBe(true)
        session.deleteLayer(['layers', 0])
        expect(session.store.doc!.layers).toHaveLength(0)

        expect(session.pasteFromClipboard()).toEqual(['layers', 0])
        expect(session.store.doc!.layers[0]!.priority).toBe(0)
    })

    it('同一剪贴板连续粘贴：偏移递增（+20、+40），三次落点互不重叠', () => {
        const session = makeSession([imageLayer({ priority: 10, position: { x: 0, y: 0 } })])
        select(session, ['layers', 0])
        session.copySelection()

        expect(session.pasteFromClipboard()).toEqual(['layers', 1])
        expect(session.pasteFromClipboard()).toEqual(['layers', 2])
        expect(positions(session)).toEqual(['0,0', '20,20', '40,40'])
        const set = new Set(positions(session))
        expect(set.size).toBe(3)
    })

    it('子树深拷贝：复制后改原件，粘贴产物保持复制时状态（表格行/格/内容下钻）', () => {
        const session = makeSession([tableWithCells()])
        select(session, ['layers', 0])
        expect(session.copySelection()).toBe(true)

        // 复制后改原件：文本、格宽、行数、原件位置
        session.updateData(['layers', 0, 'rows', 0, 'cells', 0, 'content'], '改')
        session.updateSpec(['layers', 0, 'rows', 0, 'cells', 0], ['shape', 'width'], 500)
        session.addTableRow(['layers', 0])
        session.updateSpec(['layers', 0], ['position', 'x'], 777)

        session.pasteFromClipboard()
        const copy = session.store.doc!.layers[1] as TableLayer
        expect(copy).not.toBe(session.store.doc!.layers[0])
        expect(copy.rows).toHaveLength(1) // 复制时点：一行
        const cell = copy.rows[0]!.cells[0]!
        expect(cell.shape.width).toBe(200) // 复制时点：200
        expect(cell.content).not.toBeNull()
        expect((cell.content as TextLayer).text).toBe('甲') // 复制时点文本
        expect(copy.position.x).toBe(60) // 40 + 20，与改位后的原件（777）无关
        // 原件已被后续编辑改动
        expect((session.store.doc!.layers[0] as TableLayer).rows).toHaveLength(2)
    })

    it('格内容可复制：粘贴落为根层，落位 = 格内容的绝对盒 + 20（非格内相对 position）', () => {
        const session = makeSession([tableWithCells()])
        select(session, ['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        expect(session.copySelection()).toBe(true)
        expect(session.pasteFromClipboard()).toEqual(['layers', 1])
        const pasted = session.store.doc!.layers[1] as TextLayer
        expect(pasted.type).toBe('TextLayer')
        expect(pasted.text).toBe('甲')
        expect(pasted.priority).toBe(19) // 表 priority 20 → min−1
        // 格内容绝对盒 = 表(40,30) + 行 0 偏移 + 格 0 偏移 = (40,30)；粘贴目标 (60,50)
        expect(pasted.position.x).toBe(60)
        expect(pasted.position.y).toBe(50)
    })

    it('锚点补偿：center 锚点根层副本 = 视觉位置平移 +20（position 按根层语义反解）', () => {
        const session = makeSession([
            textLayer({
                priority: 10,
                shape: { width: 100, height: 50 },
                position: { anchor: 'center', x: 100, y: 100 },
            }),
        ])
        select(session, ['layers', 0])
        expect(session.duplicateSelection()).toEqual(['layers', 1])
        const copy = session.store.doc!.layers[1] as TextLayer
        // 画布 800×600：anchorOffset center = (trunc((800−100)/2), trunc((600−50)/2)) = (350, 275)
        // 源盒 = (350+100, 275+100) = (450, 375)；目标 (470, 395) → position = 目标 − offset = (120, 120)
        expect(copy.position.anchor).toBe('center')
        expect(copy.position.x).toBe(120)
        expect(copy.position.y).toBe(120)
    })

    it('行/格不可复制（容器内结构，v1 根层语义）；无选择复制为 false', () => {
        const session = makeSession([tableWithCells()])
        select(session, ['layers', 0, 'rows', 0])
        expect(session.copySelection()).toBe(false)
        select(session, ['layers', 0, 'rows', 0, 'cells', 0])
        expect(session.copySelection()).toBe(false)
        select(session, null)
        expect(session.copySelection()).toBe(false)
        expect(session.canCopySelection).toBe(false)
    })

    it('空剪贴板粘贴返回 null（无副作用）', () => {
        const session = makeSession([textLayer({ priority: 10 })])
        expect(session.pasteFromClipboard()).toBeNull()
        expect(session.store.doc!.layers).toHaveLength(1)
    })

    it('一次粘贴 = 一步历史：撤销后消失且选择悬空清理，重做复原', () => {
        const session = makeSession([textLayer({ priority: 10, text: '顶', position: { x: 0, y: 0 } })])
        select(session, ['layers', 0])
        session.copySelection()
        session.pasteFromClipboard()
        expect(session.store.doc!.layers).toHaveLength(2)
        expect(session.canUndo).toBe(true)

        session.undo()
        expect(session.store.doc!.layers).toHaveLength(1)
        expect(session.store.ui.selection).toBeNull() // 撤销新增 → 新层路径悬空清空

        session.redo()
        expect(session.store.doc!.layers).toHaveLength(2)
        expect(session.store.ui.selection).toBeNull() // 重做不恢复选择（历史不携带 ui 路径态）
        expect((session.store.doc!.layers[1] as TextLayer).text).toBe('顶')
    })

    it('模板态表可复制：粘贴产物 template/rowsPath/标记 expression 存活（工票 02）', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        session.openDocument(
            decodeGraph({ canvas: { width: 800, height: 600 }, layers: [templateTableWire()] }),
        )
        select(session, ['layers', 0])
        expect(session.copySelection()).toBe(true)
        expect(session.pasteFromClipboard()).toEqual(['layers', 1])

        const copy = session.store.doc!.layers[1] as TableLayer
        expect(copy.template).not.toBeNull()
        expect(copy.rowsPath).toBe('order.items')
        expect(copy.rows).toEqual([])
        const text = copy.template!.cells[0]!.content as TextLayer
        expect(text.expression).toBe('姓名：{{row.name}}')
        expect(text.text).toBe('姓名：{{row.name}}') // 值字段恒镜像表达式原文
        const qr = copy.template!.cells[2]!.content as { expression: string | null; value: string }
        expect(qr.expression).toBe('{{row.code}}')
        expect(qr.value).toBe('{{row.code}}')

        const json = JSON.stringify(encodeGraph(session.store.doc!))
        expect(JSON.stringify(encodeGraph(decodeGraph(JSON.parse(json))))).toBe(json)
    })

    it('行模板本身不可复制（TableRowTemplate 不可落根层 = 不可复制）', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        session.openDocument(
            decodeGraph({ canvas: { width: 800, height: 600 }, layers: [templateTableWire()] }),
        )
        select(session, ['layers', 0, 'template'])
        expect(session.copySelection()).toBe(false)
        expect(session.duplicateSelection()).toBeNull()
        expect(session.store.doc!.layers).toHaveLength(1)
    })

    it('往返恒等：粘贴后 encode→decode→encode 字节级恒等', () => {
        const session = new EditorSession({ scheduleFrame: nullScheduler })
        session.openDocument(
            decodeGraph({
                canvas: { width: 800, height: 600 },
                layers: [
                    {
                        type: 'TableLayer',
                        priority: 20,
                        spec: {
                            shape: { width: 400, height: 80, backgroundColor: '#fff' },
                            position: { x: 40, y: 30, position: 'top-left' },
                        },
                        rows: [
                            {
                                type: 'TableRowLayer',
                                spec: { shape: { width: 400, height: 80 } },
                                cells: [
                                    {
                                        type: 'TableCellLayer',
                                        spec: { shape: { width: 200, height: 80 } },
                                        content: {
                                            type: 'TextLayer',
                                            spec: {
                                                shape: { width: 200, height: 80 },
                                                fontFamily: { fontSize: 16 },
                                            },
                                            data: { valueType: 'StaticValue', value: '甲' },
                                        },
                                    },
                                ],
                            },
                        ],
                    },
                    { type: 'TextLayer', priority: 10, spec: { shape: { width: 100, height: 40 } } },
                ],
            }),
        )
        select(session, ['layers', 0])
        session.copySelection()
        session.pasteFromClipboard()
        session.updateSpec(['layers', 2, 'rows', 0, 'cells', 0], ['shape', 'width'], 220) // 粘贴后再编辑

        const json = JSON.stringify(encodeGraph(session.store.doc!))
        expect(JSON.stringify(encodeGraph(decodeGraph(JSON.parse(json))))).toBe(json)
    })
})

describe('duplicateSelection：创建副本', () => {
    it('副本 = 复制态 + 固定偏移 +20、置顶、自动选中', () => {
        const session = makeSession([textLayer({ priority: 10, text: '源', position: { x: 5, y: 6 } })])
        select(session, ['layers', 0])

        expect(session.duplicateSelection()).toEqual(['layers', 1])
        const copy = session.store.doc!.layers[1] as TextLayer
        expect(copy.text).toBe('源')
        expect(copy.position.x).toBe(25)
        expect(copy.position.y).toBe(26)
        expect(copy.priority).toBe(9)
        expect(session.store.ui.selection).toEqual(['layers', 1])
    })

    it('连续副本基于当前选中层链式偏移，不互相重叠', () => {
        const session = makeSession([textLayer({ priority: 10, position: { x: 0, y: 0 } })])
        select(session, ['layers', 0])
        session.duplicateSelection()
        session.duplicateSelection() // 选中副本 → 再副本
        expect(positions(session)).toEqual(['0,0', '20,20', '40,40'])
    })

    it('副本不覆盖剪贴板：复制 A → 副本 B → 粘贴仍出 A', () => {
        const session = makeSession([
            textLayer({ priority: 30, text: 'A', position: { x: 0, y: 0 } }),
            textLayer({ priority: 20, text: 'B', position: { x: 300, y: 0 } }),
        ])
        select(session, ['layers', 0])
        session.copySelection()
        select(session, ['layers', 1])
        session.duplicateSelection()
        expect(session.pasteFromClipboard()).toEqual(['layers', 3])
        expect((session.store.doc!.layers[3] as TextLayer).text).toBe('A')
        expect((session.store.doc!.layers[3] as TextLayer).position.x).toBe(20) // 相对 A 复制时点
    })

    it('行/格与无选择：副本为 null（无副作用）', () => {
        const session = makeSession([tableWithCells()])
        select(session, ['layers', 0, 'rows', 0])
        expect(session.duplicateSelection()).toBeNull()
        expect(session.store.doc!.layers).toHaveLength(1)
        select(session, null)
        expect(session.duplicateSelection()).toBeNull()
    })
})

describe('bringToFront / sendToBack：右键菜单的置顶/置底（根层语义）', () => {
    it('置顶：priority = min−1、移到数组尾（面板序 0）', () => {
        const session = makeSession([
            textLayer({ priority: 30, text: '底' }),
            textLayer({ priority: 20, text: '中' }),
            textLayer({ priority: 10, text: '顶' }),
        ])
        select(session, ['layers', 0]) // 底
        session.bringToFront()
        expect(session.store.doc!.layers.map((layer) => (layer as TextLayer).text)).toEqual(['中', '顶', '底'])
        expect(session.store.doc!.layers[2]!.priority).toBe(9)
        expect(session.store.ui.selection).toEqual(['layers', 2]) // 跟随移动后的新位置
    })

    it('置底：priority = max+1、移到数组头（面板底）', () => {
        const session = makeSession([
            textLayer({ priority: 30, text: '底' }),
            textLayer({ priority: 20, text: '中' }),
            textLayer({ priority: 10, text: '顶' }),
        ])
        select(session, ['layers', 2]) // 顶
        session.sendToBack()
        expect(session.store.doc!.layers.map((layer) => (layer as TextLayer).text)).toEqual(['顶', '底', '中'])
        expect(session.store.doc!.layers[0]!.priority).toBe(31)
        expect(session.store.ui.selection).toEqual(['layers', 0])
    })

    it('已在顶/底端为无操作（不产生历史步）', () => {
        const session = makeSession([
            textLayer({ priority: 20, text: '底' }),
            textLayer({ priority: 10, text: '顶' }),
        ])
        select(session, ['layers', 1])
        session.bringToFront()
        expect(session.store.doc!.layers.map((layer) => (layer as TextLayer).text)).toEqual(['底', '顶'])
        expect(session.canUndo).toBe(false)
        select(session, ['layers', 0])
        session.sendToBack()
        expect(session.store.doc!.layers.map((layer) => (layer as TextLayer).text)).toEqual(['底', '顶'])
        expect(session.canUndo).toBe(false)
    })

    it('非根层（行/格/格内容）与无选择：无操作', () => {
        const session = makeSession([tableWithCells({ priority: 10 })])
        const before = session.store.doc!.layers.map((layer) => layer.priority)
        select(session, ['layers', 0, 'rows', 0])
        session.bringToFront()
        session.sendToBack()
        select(session, ['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        session.bringToFront()
        select(session, null)
        session.sendToBack()
        expect(session.store.doc!.layers.map((layer) => layer.priority)).toEqual(before)
        expect(session.canUndo).toBe(false)
    })

    it('置顶/置底 = 一步历史，可撤销', () => {
        const session = makeSession([
            textLayer({ priority: 20, text: '底' }),
            textLayer({ priority: 10, text: '顶' }),
        ])
        select(session, ['layers', 0])
        session.bringToFront()
        session.undo()
        expect(session.store.doc!.layers.map((layer) => (layer as TextLayer).text)).toEqual(['底', '顶'])
    })
})
