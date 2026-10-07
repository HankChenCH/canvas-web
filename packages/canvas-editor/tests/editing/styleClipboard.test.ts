/**
 * 样式剪贴板（canvas-web-style-paste 工单 01）：样式集/适用面常量、复制快照与
 * 粘贴事务。
 *
 * - 样式 = 三族字段子集（spec 决策 2）：盒内对齐、形状皮肤、文本族；适用面按
 *   LayerType 由内核 editing 域自持（对齐 editor-vue fieldSchema 的分组事实但
 *   不引它——依赖方向红线）。
 * - copyStyle：按源类型适用面抓逐字段深拷贝快照进会话私有槽，与图层剪贴板
 *   分立互不覆盖；openDocument 保留（跨文档粘贴样式合法）；拷贝不进历史。
 * - pasteStyle：目标类型适用面 ∩ 快照逐字段 verbatim 覆盖（null 即值、Border
 *   整对象），单事务 = 一步历史 undo 全回；全等字段跳写、零变化空转；
 *   autoHeight⟹height=0 与表格强同步重断言（updateSpec 同门）。
 * - 注册表/dispatcher 面见 session/shortcuts.test.ts。
 */
import { describe, expect, it } from 'vitest'

import { decodeGraph } from '@hankchen/canvas'
import type { Border, ImageLayer, Layer, TableLayer, TextLayer } from '@hankchen/canvas'

import { STYLE_FIELD_KEYS_BY_TYPE, captureStyleSnapshot } from '../../src/editing/styleClipboard'
import { EditorSession } from '../../src/session/editor'
import type { FrameScheduler } from '../../src/session/editor'
import {
    cellLayer,
    imageLayer,
    qrLayer,
    rowLayer,
    rowTemplateLayer,
    tableLayer,
    templateTableWire,
    textLayer,
} from '../support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

const makeSession = (layers: readonly Layer[]) => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument({ width: 800, height: 600, layers: [...layers] })
    return session
}

const makeTemplateSession = () => {
    const session = new EditorSession({ scheduleFrame: nullScheduler })
    session.openDocument(decodeGraph({ canvas: { width: 800, height: 600 }, layers: [templateTableWire()] }))
    return session
}

/** 模板文档 + 追加根层文本（['layers', 1]，addRootLayer 自动选中）作模板子树之外的样式载体 */
const makeTemplateSessionWithLayer = () => {
    const session = makeTemplateSession()
    session.addRootLayer('TextLayer')
    return session
}

const fieldIds = (keys: readonly (readonly string[])[]): string[] => keys.map((key) => key.join('.'))

/** 四边中两边有值的边框（整对象覆盖 / null 边保留语义的载体） */
const BORDER: Border = {
    top: { width: 2, color: '#ff0000' },
    bottom: null,
    left: { width: 1, color: '#00ff00' },
    right: null,
}

/** 全边边框（验证粘贴把旧边整体冲掉，而非逐边合并） */
const FULL_BORDER: Border = {
    top: { width: 4, color: '#000000' },
    bottom: { width: 5, color: '#111111' },
    left: { width: 6, color: '#222222' },
    right: { width: 7, color: '#333333' },
}

const PADDING = { top: 3, bottom: 4, left: 5, right: 6 }

/** 带全套样式的文本层源 */
const styledText = (): TextLayer =>
    textLayer({
        font: 'fonts/f.ttf',
        fontSize: 24,
        fontColor: '#ff0000',
        angle: 15,
        autowrap: true,
        align: { horizontal: 'center', vertical: 'center' },
        shape: { backgroundColor: '#ffffff', border: BORDER, padding: PADDING, lineHeight: 1.5 },
    })

describe('STYLE_FIELD_KEYS_BY_TYPE：七 type 适用面常量（spec 决策 2/3）', () => {
    it('文本层全量三族 11 键：盒内对齐 + 形状皮肤 + 文本族（lineHeight 随文本族走）', () => {
        expect(fieldIds(STYLE_FIELD_KEYS_BY_TYPE.TextLayer)).toEqual([
            'align.horizontal',
            'align.vertical',
            'shape.backgroundColor',
            'shape.border',
            'shape.padding',
            'font',
            'fontSize',
            'fontColor',
            'autowrap',
            'angle',
            'shape.lineHeight',
        ])
    })

    it('非文本层五键：对齐 + 皮肤（图片/二维码/表/行/格同面，字体族不适用）', () => {
        const five = [
            'align.horizontal',
            'align.vertical',
            'shape.backgroundColor',
            'shape.border',
            'shape.padding',
        ]
        for (const type of ['ImageLayer', 'QrCodeLayer', 'TableLayer', 'TableRowLayer', 'TableCellLayer'] as const) {
            expect(fieldIds(STYLE_FIELD_KEYS_BY_TYPE[type])).toEqual(five)
        }
    })

    it('行模板替身无样式面（面板只暴露高/高自适应——尺寸族不在样式集）', () => {
        expect(STYLE_FIELD_KEYS_BY_TYPE.TableRowTemplate).toEqual([])
    })

    it('明确排除面：几何/基面/数据/标记/表格结构字段不入集（spec 决策 2 排除清单）', () => {
        const forbidden = new Set([
            'position.x',
            'position.y',
            'position.anchor',
            'shape.width',
            'shape.height',
            'shape.autoWidth',
            'shape.autoHeight',
            'name',
            'visible',
            'priority',
            'text',
            'src',
            'value',
            'expression',
            'template',
            'rows',
            'rowsPath',
        ])
        for (const keys of Object.values(STYLE_FIELD_KEYS_BY_TYPE)) {
            for (const id of fieldIds(keys)) {
                expect(forbidden.has(id)).toBe(false)
            }
        }
    })
})

describe('captureStyleSnapshot：逐字段深拷贝快照', () => {
    it('快照字段集按七 type：文本层 11 键、其余五键', () => {
        const textKeys = Object.keys(captureStyleSnapshot(textLayer())!.values).sort()
        expect(textKeys).toEqual(fieldIds(STYLE_FIELD_KEYS_BY_TYPE.TextLayer).sort())
        const fiveKeys = [
            'align.horizontal',
            'align.vertical',
            'shape.backgroundColor',
            'shape.border',
            'shape.padding',
        ].sort()
        expect(Object.keys(captureStyleSnapshot(imageLayer())!.values).sort()).toEqual(fiveKeys)
        expect(Object.keys(captureStyleSnapshot(qrLayer())!.values).sort()).toEqual(fiveKeys)
        expect(Object.keys(captureStyleSnapshot(tableLayer([]))!.values).sort()).toEqual(fiveKeys)
        expect(Object.keys(captureStyleSnapshot(rowLayer([]))!.values).sort()).toEqual(fiveKeys)
        expect(Object.keys(captureStyleSnapshot(cellLayer(null))!.values).sort()).toEqual(fiveKeys)
    })

    it('三族字段值齐全（{sourceType, values} 形态）', () => {
        const snapshot = captureStyleSnapshot(styledText())
        expect(snapshot?.sourceType).toBe('TextLayer')
        expect(snapshot?.values['font']).toBe('fonts/f.ttf')
        expect(snapshot?.values['fontSize']).toBe(24)
        expect(snapshot?.values['fontColor']).toBe('#ff0000')
        expect(snapshot?.values['autowrap']).toBe(true)
        expect(snapshot?.values['angle']).toBe(15)
        expect(snapshot?.values['shape.lineHeight']).toBe(1.5)
        expect(snapshot?.values['align.horizontal']).toBe('center')
        expect(snapshot?.values['align.vertical']).toBe('center')
        expect(snapshot?.values['shape.backgroundColor']).toBe('#ffffff')
        expect(snapshot?.values['shape.border']).toEqual(BORDER)
        expect(snapshot?.values['shape.padding']).toEqual(PADDING)
    })

    it('深拷贝：快照与源层引用断开（Border/Padding 逐层克隆）', () => {
        const layer = textLayer({ shape: { border: BORDER, padding: PADDING } })
        const snapshot = captureStyleSnapshot(layer)!
        expect(snapshot.values['shape.border']).not.toBe(layer.shape.border)
        expect((snapshot.values['shape.border'] as Border).top).not.toBe(layer.shape.border.top)
        expect(snapshot.values['shape.padding']).not.toBe(layer.shape.padding)
        expect(snapshot.values['shape.border']).toEqual(layer.shape.border)
        expect(snapshot.values['shape.padding']).toEqual(layer.shape.padding)
    })

    it('null 即样式事实：背景色 null / null 边照抓（粘贴端 verbatim 覆盖）', () => {
        const snapshot = captureStyleSnapshot(textLayer({ shape: { backgroundColor: null } }))
        expect(snapshot?.values['shape.backgroundColor']).toBeNull()
        expect((captureStyleSnapshot(textLayer())!.values['shape.border'] as Border).bottom).toBeNull()
    })

    it('行模板替身无样式面：返回 null（无样式可复制，不产空快照）', () => {
        expect(captureStyleSnapshot(rowTemplateLayer([]))).toBeNull()
    })
})

describe('copyStyle / pasteStyle：会话私有槽与粘贴事务', () => {
    it('同型全量落地：文本 → 文本 11 字段 verbatim', () => {
        const session = makeSession([styledText(), textLayer({ priority: 5 })])
        expect(session.copyStyle(['layers', 0])).toBe(true)
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        const target = session.store.doc!.layers[1] as TextLayer
        expect(target.font).toBe('fonts/f.ttf')
        expect(target.fontSize).toBe(24)
        expect(target.fontColor).toBe('#ff0000')
        expect(target.autowrap).toBe(true)
        expect(target.angle).toBe(15)
        expect(target.shape.lineHeight).toBe(1.5)
        expect(target.align).toEqual({ horizontal: 'center', vertical: 'center' })
        expect(target.shape.backgroundColor).toBe('#ffffff')
        expect(target.shape.border).toEqual(BORDER)
        expect(target.shape.padding).toEqual(PADDING)
        // 数据字段不属样式：内容不被触碰
        expect(target.text).toBe('你好画布')
    })

    it('跨型交集：文本 → 图片，对齐 + 皮肤落地、字体族静默跳过（spec 决策 3）', () => {
        const session = makeSession([styledText(), imageLayer({ priority: 5 })])
        session.copyStyle(['layers', 0])
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        const target = session.store.doc!.layers[1] as ImageLayer
        expect(target.align).toEqual({ horizontal: 'center', vertical: 'center' })
        expect(target.shape.backgroundColor).toBe('#ffffff')
        expect(target.shape.border).toEqual(BORDER)
        expect(target.shape.padding).toEqual(PADDING)
        // 数据字段不动
        expect(target.src).toBeNull()
        expect(target.expression).toBeNull()
    })

    it('跨型交集反向：图片 → 文本，皮肤落地、字体族保持原值', () => {
        const session = makeSession([
            imageLayer({
                priority: 10,
                align: { horizontal: 'right', vertical: 'bottom' },
                shape: { backgroundColor: '#00ff00', border: BORDER, padding: PADDING },
            }),
            textLayer({ priority: 5 }),
        ])
        session.copyStyle(['layers', 0])
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        const target = session.store.doc!.layers[1] as TextLayer
        expect(target.shape.backgroundColor).toBe('#00ff00')
        expect(target.shape.border).toEqual(BORDER)
        expect(target.shape.padding).toEqual(PADDING)
        expect(target.align).toEqual({ horizontal: 'right', vertical: 'bottom' })
        // 字体族不在快照（源不适型）：目标保持原值
        expect(target.font).toBe('')
        expect(target.fontSize).toBe(16)
        expect(target.fontColor).toBe('#111827')
        expect(target.autowrap).toBe(false)
        expect(target.angle).toBe(0)
        expect(target.shape.lineHeight).toBe(1.2)
    })

    it('null 即值：源无填充照粘，目标旧背景色被清（Figma 同语义）', () => {
        const session = makeSession([
            textLayer({ priority: 10, shape: { backgroundColor: null } }),
            textLayer({ priority: 5, shape: { backgroundColor: '#ffffff' } }),
        ])
        session.copyStyle(['layers', 0])
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        expect((session.store.doc!.layers[1] as TextLayer).shape.backgroundColor).toBeNull()
    })

    it('Border 整对象覆盖：目标旧边被冲掉（含 null 边），非逐边合并', () => {
        const session = makeSession([
            textLayer({ priority: 10, shape: { border: BORDER } }),
            textLayer({ priority: 5, shape: { border: FULL_BORDER } }),
        ])
        session.copyStyle(['layers', 0])
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        expect((session.store.doc!.layers[1] as TextLayer).shape.border).toEqual(BORDER)
    })

    it('全等字段跳写、零变化经空 patch 短路：自粘/同款粘贴不进历史', () => {
        const session = makeSession([styledText(), styledText()])
        session.copyStyle(['layers', 0])
        expect(session.canUndo).toBe(false) // 拷贝不进历史
        // 自粘全等：零变化空转
        expect(session.pasteStyle(['layers', 0])).toBe(false)
        expect(session.canUndo).toBe(false)
        // 贴到同款层：逐字段全等跳写 → 整事务零 patch → 空转
        expect(session.pasteStyle(['layers', 1])).toBe(false)
        expect(session.canUndo).toBe(false)
    })

    it('一次粘贴 = 一步历史：undo 全字段回滚，连续粘贴不合并', () => {
        const session = makeSession([styledText(), textLayer({ priority: 5 })])
        session.copyStyle(['layers', 0])
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        expect(session.store.history).toHaveLength(1)
        // 连续粘贴不合并：改目标（独立历史步）后再贴一步独立历史（对齐画布先例，每次点击独立步）
        session.updateSpec(['layers', 1], ['fontSize'], 9)
        expect(session.store.history).toHaveLength(2)
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        expect(session.store.history).toHaveLength(3)
        session.undo()
        expect((session.store.doc!.layers[1] as TextLayer).fontSize).toBe(9) // 撤的是第二次粘贴
        session.undo()
        expect((session.store.doc!.layers[1] as TextLayer).fontSize).toBe(24) // 撤 updateSpec
        session.undo()
        const target = session.store.doc!.layers[1] as TextLayer
        expect(target.fontSize).toBe(16)
        expect(target.fontColor).toBe('#111827')
        expect(target.shape.backgroundColor).toBeNull()
        expect(target.shape.border).toEqual({ top: null, bottom: null, left: null, right: null })
    })

    it('深拷贝快照：复制后编辑源层，粘贴产物保持复制时点值', () => {
        const session = makeSession([styledText(), textLayer({ priority: 5 })])
        session.copyStyle(['layers', 0])
        session.updateSpec(['layers', 0], ['fontSize'], 99)
        session.updateSpec(['layers', 0], ['shape', 'backgroundColor'], '#000000')
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        const target = session.store.doc!.layers[1] as TextLayer
        expect(target.fontSize).toBe(24) // 复制时点值
        expect(target.shape.backgroundColor).toBe('#ffffff')
    })

    it('与图层剪贴板分立互不覆盖：⌘C 与 ⌥⌘C 并存，两槽各自可用', () => {
        const session = makeSession([
            styledText(),
            textLayer({ priority: 8 }),
            imageLayer({ priority: 5, position: { x: 40, y: 30 } }),
        ])
        session.setSelection(['layers', 2])
        expect(session.copySelection()).toBe(true) // ⌘C：图层剪贴板
        expect(session.copyStyle(['layers', 0])).toBe(true) // ⌥⌘C：样式剪贴板
        // 图层粘贴仍出图片层（样式复制未覆盖图层剪贴板）
        expect(session.pasteFromClipboard()).toEqual(['layers', 3])
        expect(session.store.doc!.layers[3]!.type).toBe('ImageLayer')
        // 样式粘贴仍出文本源样式（图层复制未覆盖样式剪贴板）
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        expect((session.store.doc!.layers[1] as TextLayer).fontSize).toBe(24)
    })

    it('openDocument 不清空样式槽：跨文档粘贴样式合法（图层剪贴板同门）', () => {
        const session = makeSession([styledText()])
        expect(session.copyStyle(['layers', 0])).toBe(true)
        session.openDocument({ width: 400, height: 300, layers: [textLayer({ priority: 1 })] })
        expect(session.canPasteStyle).toBe(false) // 槽保留但选择随换文档重置
        session.setSelection(['layers', 0])
        expect(session.canPasteStyle).toBe(true)
        expect(session.pasteStyle(['layers', 0])).toBe(true)
        expect((session.store.doc!.layers[0] as TextLayer).fontSize).toBe(24)
    })

    it('模板子树源放行：格内容样式可复制，跨型交集照常', () => {
        const session = makeTemplateSessionWithLayer()
        // 模板格内容（TextLayer，fontSize 12 / 行高 1 / 底对齐）作源
        expect(session.copyStyle(['layers', 0, 'template', 'cells', 0, 'content'])).toBe(true)
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        const target = session.store.doc!.layers[1] as TextLayer
        expect(target.fontSize).toBe(12)
        expect(target.fontColor).toBe('#000000')
        expect(target.shape.lineHeight).toBe(1)
        expect(target.align.vertical).toBe('bottom')
        // 快照不含数据/标记字段：目标内容与标记不动
        expect(target.text).toBe('文本')
        expect(target.expression).toBeNull()
    })

    it('模板子树目标放行：格（对齐+皮肤）与格内容（全量）逐字段落地', () => {
        const session = makeTemplateSessionWithLayer()
        // 造样式源：updateSpec 逐字段（面板同门写入管线；fontSize 24 是新层缺省值，改用 32）
        session.updateSpec(['layers', 1], ['font'], 'fonts/f.ttf')
        session.updateSpec(['layers', 1], ['fontSize'], 32)
        session.updateSpec(['layers', 1], ['fontColor'], '#ff0000')
        session.updateSpec(['layers', 1], ['shape', 'lineHeight'], 1.5)
        session.updateSpec(['layers', 1], ['align', 'horizontal'], 'center')
        session.updateSpec(['layers', 1], ['shape', 'backgroundColor'], '#ffffff')
        session.updateSpec(['layers', 1], ['shape', 'border'], BORDER)
        session.updateSpec(['layers', 1], ['shape', 'padding'], PADDING)
        expect(session.copyStyle(['layers', 1])).toBe(true)

        // 模板格目标：对齐 + 皮肤落地，格内容不受牵连
        expect(session.pasteStyle(['layers', 0, 'template', 'cells', 0])).toBe(true)
        const doc = session.store.doc!
        const cell0 = (doc.layers[0] as TableLayer).template!.cells[0]!
        expect(cell0.align.horizontal).toBe('center')
        expect(cell0.shape.backgroundColor).toBe('#ffffff')
        expect(cell0.shape.border).toEqual(BORDER)
        expect(cell0.shape.padding).toEqual(PADDING)
        expect((cell0.content as TextLayer).fontSize).toBe(12)

        // 模板格内容目标：文本族 + 皮肤 + 对齐全量落地，值字段与标记不触碰
        expect(session.pasteStyle(['layers', 0, 'template', 'cells', 0, 'content'])).toBe(true)
        // immer 事务后文档树换引用：从当前树重新解析
        const content = (session.store.doc!.layers[0] as TableLayer).template!.cells[0]!.content as TextLayer
        expect(content.fontSize).toBe(32)
        expect(content.fontColor).toBe('#ff0000')
        expect(content.shape.lineHeight).toBe(1.5)
        expect(content.expression).toBe('姓名：{{row.name}}') // 标记镜像不动
        expect(content.text).toBe('姓名：{{row.name}}')
    })

    it('V1 格内容目标放行：样式落地且表格强同步收口（内容宽=格宽、auto 格采纳内容高）', () => {
        const session = makeSession([
            tableLayer(
                [
                    rowLayer(
                        [
                            cellLayer(textLayer({ autowrap: true, text: '统一换字体', shape: { width: 100 } }), {
                                shape: { width: 200, height: 0, autoHeight: true },
                            }),
                        ],
                        { shape: { width: 200, height: 80 } },
                    ),
                ],
                { priority: 20 },
            ),
            styledText(),
        ])
        session.copyStyle(['layers', 1])
        expect(session.pasteStyle(['layers', 0, 'rows', 0, 'cells', 0, 'content'])).toBe(true)
        const cell = (session.store.doc!.layers[0] as TableLayer).rows[0]!.cells[0]!
        const content = cell.content as TextLayer
        // 样式落地
        expect(content.shape.padding).toEqual(PADDING)
        expect(content.fontSize).toBe(24)
        // canonicalize 重断言：内容宽同步格宽、auto 格采纳内容动态高并固化
        expect(content.shape.width).toBe(200)
        expect(cell.shape.autoHeight).toBe(false)
        expect(cell.shape.height).toBeGreaterThan(0)
    })

    it('autoHeight⟹height=0 断言：auto 文本层粘贴后声明高归零（updateSpec 同门）', () => {
        const session = makeSession([
            styledText(),
            textLayer({ priority: 5, shape: { autoHeight: true, height: 5 } }),
        ])
        session.copyStyle(['layers', 0])
        expect(session.pasteStyle(['layers', 1])).toBe(true)
        const target = session.store.doc!.layers[1] as TextLayer
        expect(target.shape.height).toBe(0)
        expect(target.shape.autoHeight).toBe(true)
    })

    it('无样式源不占槽：行模板替身复制失败，先前快照保留可用', () => {
        const session = makeTemplateSessionWithLayer()
        session.updateSpec(['layers', 1], ['fontSize'], 32) // 新层缺省 24，改出差异
        expect(session.copyStyle(['layers', 1])).toBe(true)
        // 行模板替身无样式面：复制空转、槽不被清
        expect(session.copyStyle(['layers', 0, 'template'])).toBe(false)
        session.addRootLayer('TextLayer') // ['layers', 2]，自动选中
        expect(session.canPasteStyle).toBe(true)
        expect(session.pasteStyle(['layers', 2])).toBe(true)
        expect((session.store.doc!.layers[2] as TextLayer).fontSize).toBe(32) // 先前快照
    })

    it('守卫：无文档/悬空路径/无样式面/空槽空转，零副作用', () => {
        const bare = new EditorSession({ scheduleFrame: nullScheduler })
        expect(bare.copyStyle(['layers', 0])).toBe(false)
        expect(bare.pasteStyle(['layers', 0])).toBe(false)
        expect(bare.canCopyStyle).toBe(false)
        expect(bare.canPasteStyle).toBe(false)

        const session = makeTemplateSession()
        // 悬空路径
        expect(session.copyStyle(['layers', 9])).toBe(false)
        expect(session.pasteStyle(['layers', 9])).toBe(false)
        expect(session.canUndo).toBe(false)
        // 无样式面（行模板替身）
        expect(session.copyStyle(['layers', 0, 'template'])).toBe(false)
        session.setSelection(['layers', 0, 'template'])
        expect(session.canCopyStyle).toBe(false)
        // 空槽粘贴空转
        expect(session.pasteStyle(['layers', 0])).toBe(false)
        expect(session.canUndo).toBe(false)
    })

    it('可用态 getters：复制需可解析选择且有样式面，粘贴需槽非空 + 目标可解析', () => {
        const session = makeTemplateSession()
        expect(session.canCopyStyle).toBe(false) // 无选择
        expect(session.canPasteStyle).toBe(false) // 槽空
        session.setSelection(['layers', 0])
        expect(session.canCopyStyle).toBe(true) // 表有样式面
        expect(session.canPasteStyle).toBe(false)
        expect(session.copyStyle(['layers', 0])).toBe(true)
        expect(session.canPasteStyle).toBe(true)
        session.setSelection(['layers', 0, 'template']) // 行模板替身
        expect(session.canCopyStyle).toBe(false) // 无样式面
        expect(session.canPasteStyle).toBe(true) // 目标可解析即可，交集空转在动作面兜底
        session.setSelection(['layers', 9]) // 悬空
        expect(session.canCopyStyle).toBe(false)
        expect(session.canPasteStyle).toBe(false)
    })
})
