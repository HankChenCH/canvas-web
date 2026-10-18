import { describe, expect, it } from 'vitest'

import type { Canvas } from '@hankchen/canvas'

import {
    enumerateRowsPathCandidates,
    enumerateRowsPathPickerEntries,
    leadsToArray,
    resolveRowsPathStartSchema,
} from '../../src/shared/rowsPathCandidates'
import {
    parseExpressionSchema,
    schemaNodeAtPath,
    type ExpressionSchemaNode,
} from '../../src/shared/expressionSchema'
import { cellLayer, rowLayer, rowTemplateLayer, tableLayer, textLayer } from '../support/fixtures'

/**
 * rowsPath 候选枚举器 + 起点三分流判别测试（rows-path-completion 工单 01，
 * spec §2 候选规则逐条导出水合语义 + §4.1 落位 D9）：
 * - object 子段 = 可下钻中间站（无徽标数据）；array 子段（type 声明 array 或声明
 *   items）= 合法终点候选，type 徽标数据恒 'array'；标量子段不出候选（怂恿无效
 *   路径即怂恿 rows_path_invalid）。
 * - 数组内不下钻：完成段任一落点为数组/标量 → null（具名段穿数组在水合端无意义，
 *   与漂移同款：无补全态、不抛错、手输不受阻）。
 * - 候选给当前层全量合法子项、不按 partial 预过滤（前缀过滤归工单 02 浮层面）；
 *   单尾点 = 剥点列全量子段。
 * - open 节点信号面（additionalProperties: true，D10）已随契约废除移除（ADR
 *   0020）——无 properties 的对象节点按标量判别（不出候选、下钻走不通）。
 * - 起点三分流（D3）：无 template 祖先 → 载荷根 schema；有祖先沿每个 template 段
 *   行相对递归 resolveRowSchema；任一层解析不出 → null 降级无候选。
 *
 * Node 无 DOM 纯函数测试（expressionCandidates.test.ts 同款环境）；模板文档经
 * tests/support fixtures 造数（判别件只读 resolveLayer 面，不走解码）。
 */

/* ---------------------------------------------------------------- 枚举器造数 */

const RAW_SCHEMA = {
    type: 'object',
    properties: {
        certName: { type: 'string', description: '证书名称' },
        issueDate: { type: ['null', 'string'], description: '发证日期' },
        org: {
            type: 'object',
            description: '机构信息',
            properties: {
                name: { type: 'string', description: '机构名称' },
                students: {
                    type: 'array',
                    description: '学员列表',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: '学员姓名' },
                            courses: {
                                type: 'array',
                                title: '报读课程',
                                items: {
                                    type: 'object',
                                    properties: { title: { type: 'string', description: '课程名' } },
                                },
                            },
                        },
                    },
                },
            },
        },
        chapters: { type: 'array', description: '章节列表', title: '章节', items: { type: 'string' } },
        fields: { type: 'object', description: '自定义字段', properties: { meta: { type: 'object', description: '字段元信息', properties: { label: { type: 'string' } } } } },
        mixed: { title: '混合数组', items: { type: 'object', properties: { kind: { type: 'string' } } } },
    },
}

function schemaOf(raw: unknown): ExpressionSchemaNode {
    const parsed = parseExpressionSchema(raw)
    if (!parsed.ok) throw new Error(parsed.detail)
    return parsed.schema
}

const SCHEMA = schemaOf(RAW_SCHEMA)

describe('enumerateRowsPathCandidates：候选规则（工单 01）', () => {
    it('空输入列起点全量：标量不出 / object 中间站无徽标 / array 终点带 type 数据', () => {
        const result = enumerateRowsPathCandidates(SCHEMA, '')
        if (result === null) throw new Error('空输入应枚举成功')
        expect(result.partial).toBe('')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual([
            'org',
            'chapters',
            'fields',
            'mixed',
        ])
        const org = result.candidates.find((candidate) => candidate.segment === 'org')
        expect(org).toMatchObject({ path: 'org', description: '机构信息' })
        expect(org?.type).toBeUndefined() // 中间站无徽标数据（type: 'object' 声明不透出）
        const chapters = result.candidates.find((candidate) => candidate.segment === 'chapters')
        expect(chapters).toMatchObject({ path: 'chapters', type: 'array' })
        const mixed = result.candidates.find((candidate) => candidate.segment === 'mixed')
        expect(mixed).toMatchObject({ path: 'mixed', type: 'array' }) // 仅声明 items（无 type）仍判数组
    })

    it('type 联合归一为标量的子段不出候选（issueDate: [null, string]）', () => {
        const result = enumerateRowsPathCandidates(SCHEMA, '')
        if (result === null) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).not.toContain('issueDate')
        expect(result.candidates.map((candidate) => candidate.segment)).not.toContain('certName')
    })

    it('partial 不预过滤：任意输入串都给当前层全量合法子项（前缀过滤归浮层）', () => {
        for (const input of ['org', 'zzz', 'chapters']) {
            const result = enumerateRowsPathCandidates(SCHEMA, input)
            if (result === null) throw new Error(`"${input}" 应枚举成功`)
            expect(result.partial).toBe(input)
            expect(result.candidates.map((candidate) => candidate.segment)).toEqual([
                'org',
                'chapters',
                'fields',
                'mixed',
            ])
        }
    })

    it('object 下钻 + 单尾点：剥点列该层全量子段，partial 空', () => {
        const result = enumerateRowsPathCandidates(SCHEMA, 'org.')
        if (result === null) throw new Error('尾点应枚举成功')
        expect(result.partial).toBe('')
        expect(result.candidates).toHaveLength(1)
        expect(result.candidates[0]).toMatchObject({
            path: 'org.students',
            segment: 'students',
            description: '学员列表',
            type: 'array',
        })
    })

    it('下钻带 partial：候选仍全量、partial = 尾段', () => {
        const result = enumerateRowsPathCandidates(SCHEMA, 'org.st')
        if (result === null) throw new Error('应枚举成功')
        expect(result.partial).toBe('st')
        expect(result.candidates.map((candidate) => candidate.path)).toEqual(['org.students'])
    })

    it('数组之下无下钻：尾点打在数组段 / 具名段穿数组 → null', () => {
        expect(enumerateRowsPathCandidates(SCHEMA, 'org.students.')).toBeNull()
        expect(enumerateRowsPathCandidates(SCHEMA, 'org.students.name')).toBeNull()
        expect(enumerateRowsPathCandidates(SCHEMA, 'chapters.')).toBeNull()
    })

    it('标量落点走不通：尾点打在标量段 → null', () => {
        expect(enumerateRowsPathCandidates(SCHEMA, 'certName.')).toBeNull()
        expect(enumerateRowsPathCandidates(SCHEMA, 'org.name.')).toBeNull()
        expect(enumerateRowsPathCandidates(SCHEMA, 'org.name.x')).toBeNull()
    })

    it('声明漂移/缺失 → null 不抛错（含空中段）', () => {
        expect(enumerateRowsPathCandidates(SCHEMA, 'missing.')).toBeNull()
        expect(enumerateRowsPathCandidates(SCHEMA, 'org.missing.')).toBeNull()
        expect(enumerateRowsPathCandidates(SCHEMA, 'org.missing.deep')).toBeNull()
        expect(enumerateRowsPathCandidates(SCHEMA, 'org..students')).toBeNull()
    })

    it('无键对象 = 标量判别（开放映射契约废除，ADR 0020）：不出候选、下钻走不通', () => {
        const local = schemaOf({
            type: 'object',
            properties: {
                loose: { type: 'object', description: '无键对象' },
                keyed: { type: 'object', description: '具体键对象', properties: { name: { type: 'string' } } },
            },
        })
        const head = enumerateRowsPathCandidates(local, '')
        if (head === null) throw new Error('应枚举成功')
        expect(head.candidates.map((candidate) => candidate.segment)).toEqual(['keyed']) // 无键对象按标量跳过
        expect(enumerateRowsPathCandidates(local, 'loose.')).toBeNull()
    })

    it('fields 具体键下钻（动态键由宿主组装成具体 properties）：剥点列该层子段', () => {
        const result = enumerateRowsPathCandidates(SCHEMA, 'fields.')
        if (result === null) throw new Error('fields 层应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual(['meta'])
        expect(result.partial).toBe('')
    })

    it('元信息两字段分离透传（展示回落 description ?? title 归浮层）', () => {
        const result = enumerateRowsPathCandidates(SCHEMA, '')
        if (result === null) throw new Error('应枚举成功')
        const both = result.candidates.find((candidate) => candidate.segment === 'chapters')
        expect(both).toMatchObject({ description: '章节列表', title: '章节' })
        const titleOnly = result.candidates.find((candidate) => candidate.segment === 'mixed')
        expect(titleOnly).toMatchObject({ title: '混合数组' })
        expect(titleOnly?.description).toBeUndefined()
    })

    it('行 schema 起点（嵌套表场景）：路径起点相对（无 row. 前缀），标量行键不出', () => {
        const rowSchema = schemaOf({
            type: 'object',
            properties: {
                name: { type: 'string', description: '商品名称' },
                quantity: { type: 'number', description: '数量' },
                lines: { type: 'array', description: '行明细', items: { type: 'object', properties: {} } },
            },
        })
        const head = enumerateRowsPathCandidates(rowSchema, '')
        if (head === null) throw new Error('应枚举成功')
        expect(head.candidates.map((candidate) => candidate.path)).toEqual(['lines'])

        const typing = enumerateRowsPathCandidates(rowSchema, 'li')
        if (typing === null) throw new Error('应枚举成功')
        expect(typing.partial).toBe('li')
        expect(typing.candidates.map((candidate) => candidate.segment)).toEqual(['lines'])

        expect(enumerateRowsPathCandidates(rowSchema, 'lines.')).toBeNull() // 终点数组之下无下钻
    })
})

/* ------------------------------------------------------------- 起点三分流造数 */

const RAW_START_SCHEMA = {
    type: 'object',
    properties: {
        orderNo: { type: 'string' },
        order: {
            type: 'object',
            properties: {
                totalAmount: { type: 'number' },
                items: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            name: { type: 'string' },
                            lines: {
                                type: 'array',
                                items: { type: 'object', properties: { sku: { type: 'string' } } },
                            },
                        },
                    },
                },
            },
        },
    },
}

const START_SCHEMA = schemaOf(RAW_START_SCHEMA)

/** 外层表（rowsPath = order.items）→ 内层表（rowsPath = lines，行相对）→ 叶表（rowsPath = sku） */
function nestedTableDoc(): Canvas {
    const leafTable = tableLayer([], { rowsPath: 'sku', template: rowTemplateLayer([cellLayer(textLayer())]) })
    const innerTable = tableLayer([], { rowsPath: 'lines', template: rowTemplateLayer([cellLayer(leafTable)]) })
    const outerTable = tableLayer([], { rowsPath: 'order.items', template: rowTemplateLayer([cellLayer(innerTable)]) })
    return { width: 800, height: 600, background: null, layers: [outerTable] }
}

const NESTED_DOC = nestedTableDoc()

function propertyKeys(schema: ExpressionSchemaNode): string[] {
    return schema.properties ? [...schema.properties.keys()] : []
}

describe('resolveRowsPathStartSchema：起点三分流判别（D3）', () => {
    it('根层表 → 载荷根 schema（原样透出）', () => {
        expect(resolveRowsPathStartSchema(NESTED_DOC, ['layers', 0], START_SCHEMA)).toBe(START_SCHEMA)
    })

    it('无 template 祖先的路径一律根起点（根层文本层/V1 格内容层）', () => {
        const v1Doc: Canvas = {
            width: 800,
            height: 600,
            background: null,
            layers: [tableLayer([rowLayer([cellLayer(textLayer())])])],
        }
        expect(resolveRowsPathStartSchema(v1Doc, ['layers', 0], START_SCHEMA)).toBe(START_SCHEMA)
        expect(
            resolveRowsPathStartSchema(v1Doc, ['layers', 0, 'rows', 0, 'cells', 0, 'content'], START_SCHEMA),
        ).toBe(START_SCHEMA)
    })

    it('嵌套表（路径含 1 个 template 段）→ 外层行的行 schema', () => {
        const start = resolveRowsPathStartSchema(
            NESTED_DOC,
            ['layers', 0, 'template', 'cells', 0, 'content'],
            START_SCHEMA,
        )
        if (start === null) throw new Error('嵌套表应解析出行 schema')
        expect(propertyKeys(start)).toEqual(['name', 'lines'])
    })

    it('三层嵌套（路径含 2 个 template 段）→ 行相对逐级递归到第二层行 schema', () => {
        const start = resolveRowsPathStartSchema(
            NESTED_DOC,
            ['layers', 0, 'template', 'cells', 0, 'content', 'template', 'cells', 0, 'content'],
            START_SCHEMA,
        )
        if (start === null) throw new Error('深层嵌套应解析出行 schema')
        expect(propertyKeys(start)).toEqual(['sku'])
    })

    it('外层 rowsPath 无 items 声明 / 漂移 → null 降级（无候选）', () => {
        const bare = schemaOf({
            type: 'object',
            properties: {
                order: { type: 'object', properties: { items: { type: 'array' } } },
            },
        })
        const templateTableDoc: Canvas = {
            width: 800,
            height: 600,
            background: null,
            layers: [
                tableLayer([], { rowsPath: 'order.items', template: rowTemplateLayer([cellLayer(textLayer())]) }),
            ],
        }
        // order.items 有声明但无 items 行形状 → 降级
        expect(
            resolveRowsPathStartSchema(
                templateTableDoc,
                ['layers', 0, 'template', 'cells', 0, 'content'],
                bare,
            ),
        ).toBeNull()
        // rowsPath 指向声明树不存在的段（漂移）→ 降级
        const drifted = tableLayer([], { rowsPath: 'order.missing', template: rowTemplateLayer([cellLayer(textLayer())]) })
        expect(
            resolveRowsPathStartSchema(
                { width: 800, height: 600, background: null, layers: [drifted] },
                ['layers', 0, 'template', 'cells', 0, 'content'],
                START_SCHEMA,
            ),
        ).toBeNull()
    })

    it('template 段途经层不是 TableLayer（形态漂移）→ null 不抛错', () => {
        const doc: Canvas = { width: 800, height: 600, background: null, layers: [textLayer()] }
        expect(
            resolveRowsPathStartSchema(doc, ['layers', 0, 'template', 'cells', 0, 'content'], START_SCHEMA),
        ).toBeNull()
    })

    it('缺席兜底：rootSchema null → null（无补全态）；doc/path null → 根起点（判定兜底一致）', () => {
        expect(resolveRowsPathStartSchema(NESTED_DOC, ['layers', 0], null)).toBeNull()
        expect(resolveRowsPathStartSchema(null, ['layers', 0], START_SCHEMA)).toBe(START_SCHEMA)
        expect(resolveRowsPathStartSchema(NESTED_DOC, null, START_SCHEMA)).toBe(START_SCHEMA)
    })
})

describe('组合面：起点判别 → 候选枚举（工单 03 接线预演）', () => {
    it('嵌套表行 schema 直接进枚举器：行键全量、行相对路径', () => {
        const start = resolveRowsPathStartSchema(
            NESTED_DOC,
            ['layers', 0, 'template', 'cells', 0, 'content'],
            START_SCHEMA,
        )
        if (start === null) throw new Error('嵌套表应解析出行 schema')
        const head = enumerateRowsPathCandidates(start, '')
        if (head === null) throw new Error('应枚举成功')
        expect(head.candidates.map((candidate) => candidate.path)).toEqual(['lines']) // name 标量不出

        const drill = enumerateRowsPathCandidates(start, 'lines.')
        expect(drill).toBeNull() // 内层 rowsPath 终点即数组，其下无下钻
    })
})

/* --------------------------------------------------- 点选器剪枝枚举（D5 剪枝） */

/**
 * 点选器专用造数：plain 标量与 bareObject（子树无数组）应被剪掉；deep 三层对象
 * 链只在叶下挂数组（整条链应显）；matrix 数组套数组（内层不可达）。
 */
const RAW_PICKER_SCHEMA = {
    type: 'object',
    properties: {
        plain: { type: 'string' },
        bareObject: { type: 'object', properties: { note: { type: 'string' } } },
        deep: {
            type: 'object',
            description: '深层一层',
            properties: {
                deeper: {
                    type: 'object',
                    title: '深层二层',
                    properties: {
                        deepest: {
                            type: 'object',
                            description: '深层三层',
                            properties: {
                                rows: {
                                    type: 'array',
                                    description: '最深行数组',
                                    items: { type: 'object', properties: {} },
                                },
                            },
                        },
                    },
                },
            },
        },
        matrix: {
            type: 'array',
            items: { type: 'array', items: { type: 'object', properties: { cell: { type: 'string' } } } },
        },
    },
}

const PICKER_SCHEMA = schemaOf(RAW_PICKER_SCHEMA)

/** 谓词测试取节点助手：fixture 静态保证命中，null 即造数错误 */
function nodeAt(schema: ExpressionSchemaNode, segments: readonly string[]): ExpressionSchemaNode {
    const node = schemaNodeAtPath(schema, segments)
    if (node === null) throw new Error(`造数错误：${segments.join('.')} 应命中节点`)
    return node
}

describe('leadsToArray：剪枝谓词独立测（D5）', () => {
    it('标量 / 无键对象 / 子树无数组的对象 = false', () => {
        expect(leadsToArray(nodeAt(SCHEMA, ['certName']))).toBe(false)
        expect(leadsToArray(nodeAt(SCHEMA, ['issueDate']))).toBe(false)
        expect(leadsToArray(nodeAt(SCHEMA, ['fields']))).toBe(false)
        expect(leadsToArray(nodeAt(SCHEMA, ['fields', 'meta']))).toBe(false)
        const loose = schemaOf({ type: 'object', properties: { loose: { type: 'object' } } })
        expect(leadsToArray(nodeAt(loose, ['loose']))).toBe(false)
    })

    it('数组节点（type 或 items 声明）= true（终点自身，不问 items 内部）', () => {
        expect(leadsToArray(nodeAt(SCHEMA, ['chapters']))).toBe(true)
        expect(leadsToArray(nodeAt(SCHEMA, ['mixed']))).toBe(true)
        expect(leadsToArray(nodeAt(PICKER_SCHEMA, ['matrix']))).toBe(true)
    })

    it('沿 properties 链可含数组 = true（中间层与深层都判真）', () => {
        expect(leadsToArray(nodeAt(SCHEMA, ['org']))).toBe(true)
        expect(leadsToArray(nodeAt(PICKER_SCHEMA, ['deep']))).toBe(true)
        expect(leadsToArray(nodeAt(PICKER_SCHEMA, ['deep', 'deeper']))).toBe(true)
    })
})

describe('enumerateRowsPathPickerEntries：点选器剪枝枚举（rows-path-picker 工单 01，D5）', () => {
    it('根层剪枝：标量隐 / 无可达数组对象隐（fields 不出现）/ 含数组对象显 / 数组终点带标记，声明序保持', () => {
        const entries = enumerateRowsPathPickerEntries(SCHEMA, '')
        expect(entries.map((entry) => entry.segment)).toEqual(['org', 'chapters', 'mixed'])
        expect(entries.map((entry) => entry.isArray)).toEqual([false, true, true])
        expect(entries.map((entry) => entry.path)).toEqual(['org', 'chapters', 'mixed'])
    })

    it('对象条目可下钻：逐层取子层，数组条目即终点（prefix 段全量已消费）', () => {
        expect(enumerateRowsPathPickerEntries(PICKER_SCHEMA, 'deep').map((entry) => entry.path)).toEqual([
            'deep.deeper',
        ])
        expect(enumerateRowsPathPickerEntries(PICKER_SCHEMA, 'deep.deeper').map((entry) => entry.path)).toEqual([
            'deep.deeper.deepest',
        ])
        expect(enumerateRowsPathPickerEntries(PICKER_SCHEMA, 'deep.deeper.deepest')).toEqual([
            {
                path: 'deep.deeper.deepest.rows',
                segment: 'rows',
                description: '最深行数组',
                isArray: true,
            },
        ])
    })

    it('数组不展开（数组套数组内层不可达）：数组段作前缀 = 空层', () => {
        expect(enumerateRowsPathPickerEntries(PICKER_SCHEMA, 'matrix')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'org.students')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'chapters')).toEqual([])
    })

    it('元信息两字段分离透传（展示回落 description ?? title 归呈现层），未声明键不落条目', () => {
        const entries = enumerateRowsPathPickerEntries(SCHEMA, '')
        const both = entries.find((entry) => entry.segment === 'chapters')
        expect(both).toEqual({ path: 'chapters', segment: 'chapters', description: '章节列表', title: '章节', isArray: true })
        const org = entries.find((entry) => entry.segment === 'org')
        expect(org).toEqual({ path: 'org', segment: 'org', description: '机构信息', isArray: false })
        expect('title' in (org as object)).toBe(false)
        const deep = enumerateRowsPathPickerEntries(PICKER_SCHEMA, 'deep')[0]
        expect(deep).toEqual({ path: 'deep.deeper', segment: 'deeper', title: '深层二层', isArray: false })
        expect('description' in (deep as object)).toBe(false)
    })

    it('空态：null 起点 / 全树无可达行数组 → 空数组（不抛错）', () => {
        expect(enumerateRowsPathPickerEntries(null, '')).toEqual([])
        const flat = schemaOf({
            type: 'object',
            properties: {
                name: { type: 'string' },
                group: { type: 'object', properties: { count: { type: 'number' } } },
            },
        })
        expect(enumerateRowsPathPickerEntries(flat, '')).toEqual([])
        expect(enumerateRowsPathPickerEntries(flat, 'group')).toEqual([])
    })

    it('漂移/畸形前缀 → 空数组不抛错：缺失段 / 标量落点 / 双点 / 尾点 / 头点', () => {
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'missing')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'org.missing')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'org.missing.deeper')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'certName')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'org.name')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'org..students')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, 'org.')).toEqual([])
        expect(enumerateRowsPathPickerEntries(SCHEMA, '.org')).toEqual([])
    })

    it('行 schema 起点（嵌套表场景）：行相对路径，标量行键剪掉', () => {
        const rowSchema = schemaOf({
            type: 'object',
            properties: {
                name: { type: 'string', description: '商品名称' },
                lines: { type: 'array', description: '行明细', items: { type: 'object', properties: {} } },
            },
        })
        expect(enumerateRowsPathPickerEntries(rowSchema, '')).toEqual([
            { path: 'lines', segment: 'lines', description: '行明细', isArray: true },
        ])
        expect(enumerateRowsPathPickerEntries(rowSchema, 'lines')).toEqual([])
    })

    it('组合面：起点判别 → 点选器枚举（工单 03 接线预演）', () => {
        const start = resolveRowsPathStartSchema(
            NESTED_DOC,
            ['layers', 0, 'template', 'cells', 0, 'content'],
            START_SCHEMA,
        )
        if (start === null) throw new Error('嵌套表应解析出行 schema')
        expect(enumerateRowsPathPickerEntries(start, '').map((entry) => entry.path)).toEqual(['lines'])
    })
})
