import { describe, expect, it } from 'vitest'

import { encodeGraph, decodeGraph } from '@hankchen/canvas-next'

import { EditorSession } from '../../src/session/editor'
import {
    buildLayerOutline,
    createDefaultLayer,
    insertRootLayerAdjacentInDraft,
    type LayerOutlineNode,
} from '../../src/editing/layerPanel'
import { cloneLayerSubtree } from '../../src/editing/clipboard'
import type { Draft } from 'immer'
import type { Layer } from '@hankchen/canvas-next'
import type { FrameScheduler } from '../../src/session/editor'
import {
    cellLayer,
    imageLayer,
    qrLayer,
    rowLayer,
    tableLayer,
    templateTableWire,
    textLayer,
} from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (layers: Parameters<EditorSession['openDocument']>[0]['layers']) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers })
    return session
}

/** 底(30) 中(20) 顶(10)：数组头垫底、尾最上；面板序 = [顶, 中, 底] */
const stackDoc = () => [
    textLayer({ priority: 30, text: '底' }),
    textLayer({ priority: 20, text: '中' }),
    textLayer({ priority: 10, text: '顶' }),
]

/** 面板文本序（顶→底）*/
const panelTexts = (session: ReturnType<typeof makeSession>) =>
    [...session.store.doc!.layers].reverse().map((layer) => (layer.type === 'TextLayer' ? layer.text : ''))

const priorities = (session: ReturnType<typeof makeSession>) => session.store.doc!.layers.map((layer) => layer.priority)

/** 表：两行，首行两格（首格含文本内容层），次行一格——覆盖大纲全部四层角色 */
const tableDoc = () =>
    tableLayer(
        [
            rowLayer(
                [
                    cellLayer(textLayer({ text: '甲' }), { shape: { width: 300, height: 90 } }),
                    cellLayer(null, { shape: { width: 300, height: 90 } }),
                ],
                { shape: { width: 600, height: 90 } },
            ),
            rowLayer([cellLayer(null, { shape: { width: 600, height: 110 } })], {
                shape: { width: 600, height: 110 },
            }),
        ],
        { shape: { width: 600, height: 200 } },
    )

describe('buildLayerOutline：面板大纲（面板顶部 = 视觉最上层 = 数组尾）', () => {
    it('根层按数组逆序输出（priority 越大越垫底 → 面板顶 = 最小 priority）', () => {
        const doc = {
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 30, text: '底' }),
                textLayer({ priority: 20, text: '中' }),
                textLayer({ priority: 10, text: '顶' }),
            ],
        }
        const outline = buildLayerOutline(doc)
        expect(outline.map((node) => node.path)).toEqual([
            ['layers', 2],
            ['layers', 1],
            ['layers', 0],
        ])
        expect(outline.map((node) => node.type)).toEqual(['TextLayer', 'TextLayer', 'TextLayer'])
        expect(outline.every((node) => node.role === 'root')).toBe(true)
        expect(outline.every((node) => node.children.length === 0)).toBe(true)
    })

    it('表格展开三层嵌套：行/格保持数组序（行0在视觉顶部），格内容为叶', () => {
        const doc = { width: 800, height: 600, layers: [tableDoc()] }
        const outline = buildLayerOutline(doc)
        expect(outline).toHaveLength(1)
        const table = outline[0]!
        expect(table.type).toBe('TableLayer')
        expect(table.role).toBe('root')
        expect(table.path).toEqual(['layers', 0])

        const [row0, row1] = table.children
        expect(row0!.type).toBe('TableRowLayer')
        expect(row0!.role).toBe('row')
        expect(row0!.path).toEqual(['layers', 0, 'rows', 0])
        expect(row1!.path).toEqual(['layers', 0, 'rows', 1])

        const [cell0, cell1] = row0!.children
        expect(cell0!.role).toBe('cell')
        expect(cell0!.path).toEqual(['layers', 0, 'rows', 0, 'cells', 0])
        expect(cell1!.children).toHaveLength(0)

        const content = cell0!.children[0]!
        expect(content.role).toBe('content')
        expect(content.type).toBe('TextLayer')
        expect(content.path).toEqual(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        expect(content.children).toHaveLength(0)
    })

    it('空画布输出空大纲', () => {
        expect(buildLayerOutline({ width: 100, height: 100, layers: [] })).toEqual([])
    })

    it('节点携带文档 name 原文（工单 09 显示层投影）：未命名为空串', () => {
        const doc = {
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 20, name: '' }),
                textLayer({ priority: 10, name: '封面标题' }),
            ],
        }
        const outline = buildLayerOutline(doc)
        // 面板序 = 数组逆序：尾层（封面标题）在先
        expect(outline.map((node) => node.name)).toEqual(['封面标题', ''])
    })

    it('节点携带文档 visible 原文（工单 10 眼睛钮投影）：隐藏根层为 false', () => {
        const doc = {
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 20 }),
                textLayer({ priority: 10, visible: false }),
            ],
        }
        const outline = buildLayerOutline(doc)
        expect(outline.map((node) => node.visible)).toEqual([false, true])
    })

    it('节点携带锁定投影（canvas-web-layer-lock 工单 02，内核收 ui 分支入参）：锁定根层 true、其余 false、缺省入参全 false', () => {
        const doc = {
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 20 }),
                textLayer({ priority: 10 }),
            ],
        }
        // 缺省入参 = 无锁：面板未喂 lockedPaths 时投影退化全 false
        expect(buildLayerOutline(doc).map((node) => node.locked)).toEqual([false, false])
        // 面板序 = 数组逆序：锁定数组头（面板底），前缀判定只命中该子树
        expect(buildLayerOutline(doc, [['layers', 0]]).map((node) => node.locked)).toEqual([false, true])
    })

    it('锁定投影按前缀判定贯穿子树（锁定根层 = 行/格/内容全携 locked），未锁兄弟树不受累', () => {
        const doc = { width: 800, height: 600, layers: [tableDoc(), textLayer({ priority: 5 })] }
        // 面板序 = 数组逆序：[text（未锁）, table（锁定）]
        const [text, table] = buildLayerOutline(doc, [['layers', 0]])
        expect(text!.locked).toBe(false)
        const allLocked = (nodes: readonly LayerOutlineNode[]): boolean =>
            nodes.every((node) => node.locked && allLocked(node.children))
        expect(allLocked([table!])).toBe(true)
    })
})

describe('expressionPrefix：表达式前置投影（layer-panel-expression-prefix 工单 01）', () => {
    it('三内容层带标记：取全部闭合片段按 expr 重构 {{…}} 外壳、单空格连接；未标记空串', () => {
        const doc = {
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 40, expression: '编号 {{ certCode }} 姓名 {{ personProfile.name }} 尾' }),
                imageLayer({ priority: 30, expression: '{{ row.avatar }}' }),
                qrLayer({ priority: 20, expression: '{{row.code}}' }),
                textLayer({ priority: 10 }),
            ],
        }
        const outline = buildLayerOutline(doc)
        // 面板序 = 数组逆序（低 priority 在前）；expr 为 phpTrim 后路径（row. 前缀原样），字面段不参与
        expect(outline.map((node) => node.expressionPrefix)).toEqual([
            '',
            '{{row.code}}',
            '{{row.avatar}}',
            '{{certCode}} {{personProfile.name}}',
        ])
    })

    it('全部闭合片段无效：纯字面 / 含未闭合 {{ / expr 全空 → 常量 {{…}}', () => {
        const doc = {
            width: 800,
            height: 600,
            layers: [
                textLayer({ priority: 30, expression: '没有标记' }),
                textLayer({ priority: 20, expression: '{{row' }),
                textLayer({ priority: 10, expression: '{{ }}{{}}' }),
            ],
        }
        const outline = buildLayerOutline(doc)
        expect(outline.map((node) => node.expressionPrefix)).toEqual(['{{…}}', '{{…}}', '{{…}}'])
    })

    it('无效片段跳过：expr 空的闭合片段与未闭合 {{ 段不参与，有效闭合片段照常显示', () => {
        const doc = {
            width: 800,
            height: 600,
            layers: [textLayer({ priority: 10, expression: '{{}} {{certCode}} 姓名 {{row' })],
        }
        const outline = buildLayerOutline(doc)
        expect(outline[0]!.expressionPrefix).toBe('{{certCode}}')
    })

    it('未标记与非内容层恒空串：全角色节点照带字段（判据看层型 + 标记，不看 role）', () => {
        const outline = buildLayerOutline({ width: 800, height: 600, layers: [tableDoc()] })
        const flat: LayerOutlineNode[] = []
        const walk = (nodes: readonly LayerOutlineNode[]): void => {
            for (const node of nodes) {
                flat.push(node)
                walk(node.children)
            }
        }
        walk(outline)
        // 表/行/格骨架无 data 字段，格内容未标记——全树无前置（表/行0/格0/内容/格1/行1/格）
        expect(flat.map((node) => node.expressionPrefix)).toEqual(['', '', '', '', '', '', ''])
    })

    it('实例行格内容与行模板子树格内容照常计算（同判据不分 role）', () => {
        const v1Outline = buildLayerOutline({
            width: 800,
            height: 600,
            layers: [
                tableLayer(
                    [
                        rowLayer(
                            [cellLayer(textLayer({ text: '甲', expression: '{{certCode}} 编号' }), { shape: { width: 300, height: 90 } })],
                            { shape: { width: 600, height: 90 } },
                        ),
                    ],
                    { shape: { width: 600, height: 200 } },
                ),
            ],
        })
        const v1Content = v1Outline[0]!.children[0]!.children[0]!.children[0]!
        expect(v1Content.role).toBe('content')
        expect(v1Content.expressionPrefix).toBe('{{certCode}}')

        // 行模板子树（canonical wire：text/image/qr 三格各带 ExpressionValue 标记）
        const tplOutline = buildLayerOutline(decodeGraph({ canvas: { width: 320, height: 120 }, layers: [templateTableWire()] }))
        const templateRow = tplOutline[0]!.children[0]!
        expect(templateRow.role).toBe('templateRow')
        const [textCell, imageCell, qrCell] = templateRow.children
        expect(textCell!.children[0]!.expressionPrefix).toBe('{{row.name}}')
        expect(imageCell!.children[0]!.expressionPrefix).toBe('{{row.avatar}}')
        expect(qrCell!.children[0]!.expressionPrefix).toBe('{{row.code}}')
    })
})

describe('createDefaultLayer：编辑器新增图层的缺省形态', () => {
    it('四种根层 type 均给出可见尺寸与合法字段（能经 encode→decode 往返）', () => {
        for (const type of ['TextLayer', 'ImageLayer', 'QrCodeLayer', 'TableLayer'] as const) {
            const layer = createDefaultLayer(type)
            expect(layer.type).toBe(type)
            expect(layer.shape.width).toBeGreaterThan(0)
            expect(layer.shape.height).toBeGreaterThan(0)
            // 工厂产物必须落在 graph 契约内：解码不报错且字段形态一致
            const roundTripped = decodeGraph(JSON.parse(JSON.stringify(encodeGraph({
                width: 800,
                height: 600,
                layers: [layer],
            }))))
            expect(roundTripped.layers[0]!.type).toBe(type)
        }
    })

    it('容器 type（行/格）也给最小合法形态（面板不直接新增，工厂保持全覆盖）', () => {
        expect(createDefaultLayer('TableRowLayer').type).toBe('TableRowLayer')
        expect(createDefaultLayer('TableCellLayer').type).toBe('TableCellLayer')
    })
})

describe('moveRootLayer：根层重排（面板坐标，priority 中点插值）', () => {
    it('插到上下邻之间：priority = (下邻 + 上邻) / 2，数组序保持 priority 降序', () => {
        const session = makeSession(stackDoc())
        // 面板 [顶, 中, 底]：把「顶」(面板0) 拖到「底」之前（to=2）→ 视觉次序变 [中, 顶, 底]
        session.moveRootLayer(0, 2)
        expect(panelTexts(session)).toEqual(['中', '顶', '底'])
        // 新上下邻：下邻「底」30、上邻「中」20 → 25；数组仍按 priority 降序
        expect(priorities(session)).toEqual([30, 25, 20])
    })

    it('拖到面板顶：priority = min − 1（越大越垫底语义不反直觉）', () => {
        const session = makeSession(stackDoc())
        session.moveRootLayer(2, 0) // 「底」拖到面板顶
        expect(panelTexts(session)).toEqual(['底', '顶', '中'])
        expect(priorities(session)).toEqual([20, 10, 9])
    })

    it('拖到面板底：priority = max + 1', () => {
        const session = makeSession(stackDoc())
        session.moveRootLayer(0, 3) // 「顶」拖到面板底
        expect(panelTexts(session)).toEqual(['中', '底', '顶'])
        expect(priorities(session)).toEqual([31, 30, 20])
    })

    it('原位/相邻位落点为无操作（不产生历史步），越界入参空转', () => {
        const session = makeSession(stackDoc())
        const before = session.store.doc
        session.moveRootLayer(1, 1) // 原位
        session.moveRootLayer(1, 2) // insert-before 下一位 = 原位
        session.moveRootLayer(-1, 0) // 越界
        session.moveRootLayer(0, 4) // 越界
        session.moveRootLayer(3, 0) // from 越界
        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })

    it('一次重排 = 一步历史，undo 完整还原数组序与 priority', () => {
        const session = makeSession(stackDoc())
        session.moveRootLayer(0, 2)
        expect(session.store.history).toHaveLength(1)
        session.undo()
        expect(panelTexts(session)).toEqual(['顶', '中', '底'])
        expect(priorities(session)).toEqual([30, 20, 10])
        session.redo()
        expect(panelTexts(session)).toEqual(['中', '顶', '底'])
        expect(priorities(session)).toEqual([30, 25, 20])
    })

    it('单层画布重排空转（无邻居可插值，priority 不动）', () => {
        const session = makeSession([textLayer({ priority: 7, text: '独' })])
        session.moveRootLayer(0, 0)
        expect(session.store.history).toHaveLength(0)
        expect(session.store.doc!.layers[0]!.priority).toBe(7)
    })
})

describe('moveRootLayer：选择/悬停随结构变更重映射', () => {
    /** [表(30), 甲(20), 乙(10)]：面板 [乙, 甲, 表] */
    const mixedDoc = () => [tableDoc(), textLayer({ priority: 20, text: '甲' }), textLayer({ priority: 10, text: '乙' })]

    it('被移动层的选中路径跟随（含表内后代路径）', () => {
        const session = makeSession(mixedDoc())
        session.setSelection(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        session.moveRootLayer(2, 0) // 表拖到面板顶：数组下标 0 → 2
        expect(session.store.ui.selection).toEqual(['layers', 2, 'rows', 0, 'cells', 0, 'content'])

        session.setSelection(['layers', 2])
        session.moveRootLayer(0, 3) // 表拖回面板底：数组下标 2 → 0
        expect(session.store.ui.selection).toEqual(['layers', 0])
    })

    it('被挤出区间的层路径同样重映射；无关路径保持不动', () => {
        const session = makeSession(mixedDoc())
        session.setSelection(['layers', 2]) // 乙（面板0）
        session.setHovered(['layers', 1]) // 甲（面板1）
        session.moveRootLayer(0, 2) // 乙插到甲之前：乙 2→1，甲 1→2
        expect(session.store.ui.selection).toEqual(['layers', 1])
        expect(session.store.ui.hovered).toEqual(['layers', 2])

        session.setSelection(['layers', 0, 'rows', 1]) // 表的行——根下标随表移动，行段原样保留
        session.moveRootLayer(0, 3) // 乙拖到面板底：表 0→1
        expect(session.store.ui.selection).toEqual(['layers', 1, 'rows', 1])
    })
})

describe('连续重排的 priority 健壮性（工单 10：不耗尽、不冲突）', () => {
    it('同间隙反复插入 100 次：priority 恒严格分立，归一化兜底后秩序依旧', () => {
        const session = makeSession(stackDoc()) // 面板 [顶, 中, 底]
        // 反复把面板底层拖到面板顶之下一位：插入间隙每次减半，触及浮点精度 → 归一化兜底
        for (let i = 0; i < 100; i += 1) {
            session.moveRootLayer(2, 1)
            const ps = priorities(session)
            // 数组序 = priority 降序不变量；相邻不得相等（无冲突）
            for (let k = 1; k < ps.length; k += 1) expect(ps[k]!).toBeLessThan(ps[k - 1]!)
            // 面板顶恒为「顶」，面板始终 3 层
            expect(panelTexts(session)[0]).toBe('顶')
            expect(panelTexts(session)).toHaveLength(3)
        }
        expect(session.store.history).toHaveLength(100)

        // 100 步全部可撤销，回到初始栈序
        for (let i = 0; i < 100; i += 1) session.undo()
        expect(panelTexts(session)).toEqual(['顶', '中', '底'])
        expect(priorities(session)).toEqual([30, 20, 10])
    })

    it('legacy 同值邻居之间插入触发归一化：全表 priority 恢复互异、视觉序不变', () => {
        const session = makeSession([
            textLayer({ priority: 10, text: 'A' }),
            textLayer({ priority: 10, text: 'B' }),
            textLayer({ priority: 5, text: 'C' }),
        ])
        // 面板 [C, A, B]（同值 stable 序）；把 C 拖到 A、B 之间 → 插值撞同值 → 归一化
        session.moveRootLayer(0, 2)
        const ps = priorities(session)
        expect(new Set(ps).size).toBe(3)
        expect(panelTexts(session)).toEqual(['B', 'C', 'A'])
        expect(session.store.history).toHaveLength(1)
    })

    it('整数中点插值经 encode→decode 往返字节恒等（保存再打开无漂移，工单 13）', () => {
        const session = makeSession(stackDoc())
        session.moveRootLayer(2, 1) // 中点插值：(20 + 10) / 2 = 15
        const wire = JSON.parse(JSON.stringify(encodeGraph(session.store.doc!)))
        const reopened = decodeGraph(wire)
        expect(buildLayerOutline(reopened).map((node) => node.path)).toEqual(
            buildLayerOutline(session.store.doc!).map((node) => node.path),
        )
        expect(JSON.stringify(encodeGraph(reopened))).toBe(JSON.stringify(encodeGraph(session.store.doc!)))
    })

    it('删除与行重排后的文档经 encode→decode 往返，面板大纲不变', () => {
        const session = makeSession([tableDoc(), textLayer({ priority: 20, text: '甲' }), textLayer({ priority: 10, text: '乙' })])
        session.deleteLayer(['layers', 0, 'rows', 1]) // 删行
        session.deleteLayer(['layers', 0, 'rows', 0, 'cells', 1]) // 删格
        session.moveTableRow(['layers', 0], 0, 2) // 行重排
        session.deleteLayer(['layers', 1]) // 删一个根层

        const wire = JSON.parse(JSON.stringify(encodeGraph(session.store.doc!)))
        const reopened = decodeGraph(wire)
        expect(buildLayerOutline(reopened)).toEqual(buildLayerOutline(session.store.doc!))
    })
})

describe('moveTableRow：表格行重排（直接改数组序，与根层语义分立）', () => {
    /** 两行异高异 priority：行0(高90, p30) 行1(高110, p20) */
    const twoRowDoc = () => [
        tableLayer(
            [
                rowLayer([cellLayer(null, { shape: { width: 600, height: 90 } })], {
                    shape: { width: 600, height: 90 },
                    priority: 30,
                }),
                rowLayer([cellLayer(null, { shape: { width: 600, height: 110 } })], {
                    shape: { width: 600, height: 110 },
                    priority: 20,
                }),
            ],
            { shape: { width: 600, height: 200 } },
        ),
    ]

    it('行重排只改 rows 数组序：行对象连同自身 priority 原样搬移（不插值）', () => {
        const session = makeSession(twoRowDoc())
        session.moveTableRow(['layers', 0], 0, 2) // 行0 移到行1 之后
        const table = session.store.doc!.layers[0]!
        expect(table.type).toBe('TableLayer')
        if (table.type !== 'TableLayer') return
        expect(table.rows.map((row) => row.priority)).toEqual([20, 30])
        // 行高随序交换：首行（视觉顶部）现在是高 110 的行
        expect(table.rows[0]!.shape.height).toBe(110)
    })

    it('几何跟随数组序：行0 的盒恒在表格顶部', () => {
        const session = makeSession(twoRowDoc())
        const yBefore = session.layerBoxAt(['layers', 0, 'rows', 0])!.y
        session.moveTableRow(['layers', 0], 0, 2)
        const yAfter = session.layerBoxAt(['layers', 0, 'rows', 0])!.y
        expect(yBefore).toBe(yAfter) // 行0 恒在顶：几何由数组序决定，与 priority 无关
    })

    it('原位/相邻落点与越界为无操作；一次重排一步历史可撤销', () => {
        const session = makeSession(twoRowDoc())
        const before = session.store.doc
        session.moveTableRow(['layers', 0], 1, 1)
        session.moveTableRow(['layers', 0], 1, 2)
        session.moveTableRow(['layers', 0], -1, 0)
        session.moveTableRow(['layers', 0], 0, 3)
        session.moveTableRow(['layers', 5], 0, 2) // 表路径不存在
        session.moveTableRow(['layers', 0, 'rows', 0], 0, 2) // 容器不是表
        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)

        session.moveTableRow(['layers', 0], 0, 2)
        expect(session.store.history).toHaveLength(1)
        session.undo()
        const table = session.store.doc!.layers[0]!
        expect(table.type === 'TableLayer' && table.rows.map((row) => row.priority)).toEqual([30, 20])
    })

    it('行内后代的选中路径跟随行移动', () => {
        const session = makeSession([
            tableLayer(
                [
                    rowLayer([cellLayer(null, { shape: { width: 300, height: 90 } })], {
                        shape: { width: 600, height: 90 },
                        priority: 30,
                    }),
                    rowLayer([cellLayer(textLayer({ text: '乙' }), { shape: { width: 300, height: 110 } })], {
                        shape: { width: 600, height: 110 },
                        priority: 20,
                    }),
                ],
                { shape: { width: 600, height: 200 } },
            ),
        ])
        session.setSelection(['layers', 0, 'rows', 1, 'cells', 0, 'content'])
        session.moveTableRow(['layers', 0], 1, 0) // 行1 移到顶部
        expect(session.store.ui.selection).toEqual(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
    })
})

describe('addRootLayer：新增图层置顶（priority = min − 1）', () => {
    it('新层插到数组尾（视觉最上）、priority 取 min−1，并自动选中', () => {
        const session = makeSession(stackDoc())
        session.addRootLayer('TextLayer')
        const layers = session.store.doc!.layers
        expect(layers).toHaveLength(4)
        expect(layers[3]!.priority).toBe(9) // min(10) − 1
        expect(panelTexts(session)[0]).toBe('文本') // 新层在面板顶
        expect(session.store.ui.selection).toEqual(['layers', 3])
        expect(session.store.history).toHaveLength(1)
    })

    it('空画布新增取 priority 0；undo 一次整层移除', () => {
        const session = makeSession([])
        session.addRootLayer('QrCodeLayer')
        expect(session.store.doc!.layers).toHaveLength(1)
        expect(session.store.doc!.layers[0]!.priority).toBe(0)
        session.undo()
        expect(session.store.doc!.layers).toHaveLength(0)
        expect(session.store.history).toHaveLength(0)
    })
})

describe('insertRootLayerAdjacentInDraft：根层紧邻插入（alt-drag-paste 工单 01 原语）', () => {
    /** 经会话事务调用原语（真实 draft 路径），返回新层下标（null = 无操作） */
    const insertAdjacent = (
        session: ReturnType<typeof makeSession>,
        layer: Layer,
        source: number | ['layers', number] | readonly (string | number)[],
    ): number | null => {
        const index: { v: number | null } = { v: null }
        session.store.transact((draft) => {
            index.v = insertRootLayerAdjacentInDraft(
                draft,
                cloneLayerSubtree(layer) as Draft<Layer>,
                source as number | Parameters<typeof insertRootLayerAdjacentInDraft>[2],
            )
        })
        return index.v
    }

    const newLayer = (text: string): Layer => textLayer({ text })

    it('中点插值：新层落源索引后一格，priority = ⌊(源 + 视觉上一层)/2⌋，数组序保持降序', () => {
        const session = makeSession(stackDoc()) // [底30, 中20, 顶10]
        const index = insertAdjacent(session, newLayer('新'), 0) // 紧邻「底」
        expect(index).toBe(1)
        const ps = priorities(session)
        expect(ps).toEqual([30, 25, 20, 10]) // (30+20)/2 = 25
        expect(panelTexts(session)).toEqual(['顶', '中', '新', '底']) // 新紧邻底的视觉上方（与中之间）
    })

    it('源为视觉最顶/数组尾：priority = source − 1，新层成为数组尾', () => {
        const session = makeSession(stackDoc())
        const index = insertAdjacent(session, newLayer('新'), 2) // 紧邻「顶」
        expect(index).toBe(3)
        expect(priorities(session)).toEqual([30, 20, 10, 9])
        expect(panelTexts(session)[0]).toBe('新')
    })

    it('单层文档：新层 priority = source − 1（无上邻即置顶同门）', () => {
        const session = makeSession([textLayer({ priority: 7, text: '独' })])
        const index = insertAdjacent(session, newLayer('新'), 0)
        expect(index).toBe(1)
        expect(priorities(session)).toEqual([7, 6])
    })

    it('无整数间隙：全表归一化兜底（moveRootLayerInDraft 同门），视觉序与降序不变量保持', () => {
        const session = makeSession([
            textLayer({ priority: 10, text: '甲' }),
            textLayer({ priority: 9, text: '乙' }),
        ])
        const index = insertAdjacent(session, newLayer('新'), 0) // 插甲与乙之间：间隙 1 无整数中点
        expect(index).toBe(1)
        const ps = priorities(session)
        expect(ps).toEqual([2048, 1024, 0]) // (N−1−i) × GAP 按数组序重赋
        expect(panelTexts(session)).toEqual(['乙', '新', '甲'])
    })

    it('按路径插入取根祖先：子树路径（表内行）紧邻其根层', () => {
        // tableDoc 缺省 p10 与甲/乙不构成降序，这里覆写表 p30（表30 > 甲20 > 乙10）
        const session = makeSession([
            { ...tableDoc(), priority: 30 },
            textLayer({ priority: 20, text: '甲' }),
            textLayer({ priority: 10, text: '乙' }),
        ])
        const index = insertAdjacent(session, newLayer('新'), ['layers', 0, 'rows', 0]) // 表的行路径
        expect(index).toBe(1)
        expect(priorities(session)).toEqual([30, 25, 20, 10]) // 表30 与 甲20 的中点
        expect(session.store.doc!.layers[1]!.type).toBe('TextLayer')
    })

    it('非法源（越界下标/无数字根段的路径）返回 null 且零变化', () => {
        const session = makeSession(stackDoc())
        const before = session.store.doc
        expect(insertAdjacent(session, newLayer('新'), 5)).toBeNull()
        expect(insertAdjacent(session, newLayer('新'), -1)).toBeNull()
        expect(insertAdjacent(session, newLayer('新'), ['layers'])).toBeNull()
        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(0)
    })

    it('整数中点插值经 encode→decode 往返字节恒等（保存再打开无漂移）', () => {
        const session = makeSession(stackDoc())
        insertAdjacent(session, newLayer('新'), 0)
        const wire = JSON.parse(JSON.stringify(encodeGraph(session.store.doc!)))
        const reopened = decodeGraph(wire)
        expect(buildLayerOutline(reopened).map((node) => node.path)).toEqual(
            buildLayerOutline(session.store.doc!).map((node) => node.path),
        )
        expect(JSON.stringify(encodeGraph(reopened))).toBe(JSON.stringify(encodeGraph(session.store.doc!)))
    })
})

describe('deleteLayer：删除图层（含子树）', () => {
    it('根层删除移除整棵子树；选中在其内则清空，一步历史可撤销', () => {
        const session = makeSession([tableDoc(), textLayer({ priority: 5, text: '乙' })])
        session.setSelection(['layers', 0, 'rows', 0, 'cells', 0])
        session.deleteLayer(['layers', 0])
        expect(session.store.doc!.layers.map((layer) => layer.type)).toEqual(['TextLayer'])
        expect(session.store.ui.selection).toBeNull()
        expect(session.store.history).toHaveLength(1)

        session.undo()
        expect(session.store.doc!.layers).toHaveLength(2)
        // 撤销后选择不会自动恢复（ui 分支不进历史），但悬空路径安全解析为空
        expect(session.store.ui.selection).toBeNull()
    })

    it('删除无关层：选择保留且根下标重映射；悬停同步处理', () => {
        const session = makeSession([tableDoc(), textLayer({ priority: 20, text: '甲' }), textLayer({ priority: 10, text: '乙' })])
        session.setSelection(['layers', 2])
        session.setHovered(['layers', 1])
        session.deleteLayer(['layers', 0]) // 删表：甲 1→0、乙 2→1
        expect(session.store.doc!.layers.map((layer) => layer.type)).toEqual(['TextLayer', 'TextLayer'])
        expect(session.store.ui.selection).toEqual(['layers', 1])
        expect(session.store.ui.hovered).toEqual(['layers', 0])
    })

    it('删行 / 删格 / 删格内容分别走 rows/cells splice 与 content 置空', () => {
        const session = makeSession([tableDoc()])
        session.deleteLayer(['layers', 0, 'rows', 1]) // 删第二行
        let table = session.store.doc!.layers[0]!
        expect(table.type === 'TableLayer' && table.rows).toHaveLength(1)

        session.deleteLayer(['layers', 0, 'rows', 0, 'cells', 1]) // 删首行第二格
        table = session.store.doc!.layers[0]!
        expect(table.type === 'TableLayer' && table.rows[0]!.cells).toHaveLength(1)

        session.deleteLayer(['layers', 0, 'rows', 0, 'cells', 0, 'content']) // 格内容置 null
        const cell = session.store.doc!.layers[0]!
        expect(cell.type === 'TableLayer' && cell.rows[0]!.cells[0]!.content).toBeNull()
        expect(session.store.history).toHaveLength(3)

        session.undo()
        session.undo()
        session.undo()
        table = session.store.doc!.layers[0]!
        expect(table.type === 'TableLayer' && table.rows).toHaveLength(2)
    })

    it('删除选中的格内容即清空选择；越界路径空转', () => {
        const session = makeSession([tableDoc()])
        session.setSelection(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        session.deleteLayer(['layers', 0, 'rows', 0, 'cells', 0, 'content'])
        expect(session.store.ui.selection).toBeNull()

        const before = session.store.doc
        session.deleteLayer(['layers', 9])
        session.deleteLayer(['layers', 0, 'rows', 9])
        session.deleteLayer(['layers'])
        expect(session.store.doc).toBe(before)
        expect(session.store.history).toHaveLength(1)
    })
})
