import { describe, expect, it } from 'vitest'

import { parseExpressionSchema, type ExpressionSchemaNode } from '../../src/shared/expressionSchema'
import { enumerateExpressionCandidates } from '../../src/shared/expressionCandidates'

/**
 * 候选枚举器（content-completion 工单 02，spec §2 候选枚举规则表，逐条导出自
 * php-canvas-next 求值/填充语义）：
 * - 根上下文（根层三字段）头部候选 = 载荷顶层键（D1：schema 声明即 data 载荷
 *   形状）+ `$root`；行上下文（格内容层）追加 `row` + `$index`（`$index` 仅行
 *   上下文给——行外求值为空串，不给写得出来但无效的表达式）。
 * - 裸键在两种上下文都走根 schema（对齐 CanvasHydrator evaluateNode 的
 *   `$rowNamespace + $root` 合并 + reserved_root_key 无遮蔽保证）。
 * - `row.` 行外不给（求值期 expression_row_outside_loop）→ 空候选。
 * - `.` 下钻走 properties 树；无 properties 节点终止该分支；数组节点收敛为叶子
 *   无具名子候选（D9 修订 D3：具名段下钻数组在求值器是静默空串——缺字段信号，
 *   不给写得出来而渲染为空白的表达式；下钻层 items 链保留供 rowsPath/row.*
 *   机制，类型徽标仍显示 array 本身）。开放映射（open）节点枚举结果携带 open
 *   信号（结果面扩展，不污染候选条目契约），供工单 10 浮层占位提示（D10）。
 * - schema null（声明被拒/降级）→ 全部无候选；行 schema 未声明 → 结构头 row
 *   仍在、行子树无候选（辅助声明不作权威）。
 */

const payloadSchemaRaw = {
    type: 'object',
    properties: {
        orderNo: { type: 'string', description: '订单号' },
        customer: {
            type: 'object',
            description: '客户信息',
            properties: {
                name: { type: ['null', 'string'], description: '客户姓名' },
            },
        },
        tags: {
            type: 'array',
            description: '标签列表',
            items: { type: 'object', properties: { label: { type: 'string', description: '标签名' } } },
        },
        remark: { description: '备注（任意值）' },
    },
}

const parsedPayload = parseExpressionSchema(payloadSchemaRaw)
if (!parsedPayload.ok) throw new Error('样例 payload schema 应合法')
const payloadSchema: ExpressionSchemaNode = parsedPayload.schema

const rowSchemaRaw = {
    type: 'object',
    description: '标签行',
    properties: { label: { type: 'string', description: '标签名' }, weight: { type: 'number', description: '权重' } },
}
const parsedRow = parseExpressionSchema(rowSchemaRaw)
if (!parsedRow.ok) throw new Error('样例 row schema 应合法')
const rowSchema: ExpressionSchemaNode = parsedRow.schema

/** 分桶样例（expression-type-methods 工单 12）：format 标记的日期串 + 数字 + 普通 string 三桶齐备 */
const bucketRaw = {
    type: 'object',
    properties: {
        issueDate: { type: 'string', format: 'date', description: '发证日期' },
        amount: { type: 'number', description: '金额' },
        name: { type: 'string', description: '姓名' },
    },
}
const parsedBucket = parseExpressionSchema(bucketRaw)
if (!parsedBucket.ok) throw new Error('分桶样例 schema 应合法')
const bucketRow: ExpressionSchemaNode = parsedBucket.schema

describe('enumerateExpressionCandidates（头部候选分表）', () => {
    it('根上下文：载荷顶层键（声明序）+ $root；不给 row/$index', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: '' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual([
            'orderNo',
            'customer',
            'tags',
            'remark',
            '$root',
        ])
        expect(result.prefix).toBe('')
        expect(result.partial).toBe('')
    })

    it('行上下文：追加 row + $index（$index 仅行上下文给）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, {
            context: 'row',
            expr: '',
            rowSchema,
        })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual([
            'orderNo',
            'customer',
            'tags',
            'remark',
            '$root',
            'row',
            '$index',
        ])
    })

    it('头部候选带 schema 元信息：description + 类型徽标（type 数组归一）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: '' })
        if (!result.ok) throw new Error('应枚举成功')
        const orderNo = result.candidates.find((candidate) => candidate.segment === 'orderNo')
        expect(orderNo).toMatchObject({ path: 'orderNo', description: '订单号', type: 'string' })
        const tags = result.candidates.find((candidate) => candidate.segment === 'tags')
        expect(tags).toMatchObject({ path: 'tags', description: '标签列表', type: 'array' })
        const remark = result.candidates.find((candidate) => candidate.segment === 'remark')
        expect(remark).toMatchObject({ path: 'remark', description: '备注（任意值）' })
        expect(remark?.type).toBeUndefined() // 未声明 type → 无徽标数据
    })

    it('D8：title 随候选分离透传（形状树两字段不走展示回落——回落归浮层 description ?? title）', () => {
        const parsed = parseExpressionSchema({
            type: 'object',
            properties: {
                both: { type: 'string', title: '两者都有', description: '描述优先' },
                onlyTitle: { type: 'string', title: '只有标题' },
            },
        })
        if (!parsed.ok) throw new Error('样例 schema 应合法')
        const result = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!result.ok) throw new Error('应枚举成功')
        const both = result.candidates.find((candidate) => candidate.segment === 'both')
        expect(both).toMatchObject({ title: '两者都有', description: '描述优先' })
        const onlyTitle = result.candidates.find((candidate) => candidate.segment === 'onlyTitle')
        expect(onlyTitle).toMatchObject({ title: '只有标题' })
        expect(onlyTitle?.description).toBeUndefined()
    })

    it('头部部分段（如 {{tag）：prefix 为空、partial = 头部名，候选给全量由 UI 按前缀过滤', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'tag', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.prefix).toBe('')
        expect(result.partial).toBe('tag')
        expect(result.candidates.map((candidate) => candidate.segment)).toContain('tags')
    })

    it('行 schema 未声明：结构头 row/$index 仍给（行数据存在不因声明缺失消失），行子树后续无候选', () => {
        const heads = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: '' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.candidates.map((candidate) => candidate.segment)).toContain('row')
        const drill = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'row.' })
        if (!drill.ok) throw new Error('应枚举成功')
        expect(drill.candidates).toEqual([])
    })
})

describe('enumerateExpressionCandidates（点下钻刷新）', () => {
    it('row. → 行键树子候选，path 带 row. 前缀、元信息透出（未过滤位不给桶候选——分桶随字段收敛出现）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'row.', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.prefix).toBe('row')
        expect(result.partial).toBe('')
        expect(result.candidates).toEqual([
            { path: 'row.label', segment: 'label', description: '标签名', type: 'string', kind: 'path' },
            { path: 'row.weight', segment: 'weight', description: '权重', type: 'number', kind: 'path' },
        ])
    })

    it('row 多层下钻 + 部分段：row.lab → prefix=row、partial=lab（行键树 label；partial 非空 → weight 的数字族桶候选在场）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'row.lab', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.prefix).toBe('row')
        expect(result.partial).toBe('lab')
        expect(result.candidates.map((candidate) => candidate.filterKey ?? candidate.segment)).toEqual([
            'label',
            'weight',
            'weight',
            'weight',
            'weight',
        ])
    })

    it('裸键下钻走 properties 树：customer. → 子键', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'customer.' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates).toEqual([{ path: 'customer.name', segment: 'name', description: '客户姓名', type: 'string', kind: 'path' }])
    })

    it('裸键在行上下文仍走根 schema（$rowNamespace + $root 合并语义）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: 'customer.', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.path)).toEqual(['customer.name'])
    })

    it('$root. 下钻 = 载荷顶层键，path 带 $root. 前缀', () => {
        for (const context of ['root', 'row'] as const) {
            const result = enumerateExpressionCandidates(payloadSchema, { context, expr: '$root.', rowSchema })
            if (!result.ok) throw new Error('应枚举成功')
            expect(result.prefix).toBe('$root')
            expect(result.candidates.map((candidate) => candidate.path)).toEqual([
                '$root.orderNo',
                '$root.customer',
                '$root.tags',
                '$root.remark',
            ])
        }
    })

    it('D9：数组节点收敛为叶子——tags. 无具名子候选（具名段下钻数组在求值器是静默空串）；非 open 信号恒缺省', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'tags.' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates).toEqual([])
        expect(result.open).toBeUndefined()
    })

    it('D10：open 节点下钻 = 空候选 + open 信号（工单 10 占位提示）；非 open 节点恒缺省', () => {
        const parsed = parseExpressionSchema({
            properties: {
                fields: { type: 'object', additionalProperties: true, description: '开放映射' },
                customer: { type: 'object', properties: { name: { type: 'string' } } },
            },
        })
        if (!parsed.ok) throw new Error('应解析通过')
        const openDrill = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: 'fields.' })
        if (!openDrill.ok) throw new Error('应枚举成功')
        expect(openDrill.candidates).toEqual([])
        expect(openDrill.open).toBe(true)

        const closedDrill = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: 'customer.' })
        if (!closedDrill.ok) throw new Error('应枚举成功')
        expect(closedDrill.candidates.map((candidate) => candidate.segment)).toEqual(['name'])
        expect(closedDrill.open).toBeUndefined()

        // 头部层信号来源 = 根节点（非 open 根恒缺省）
        const heads = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.open).toBeUndefined()
    })

    it('无 properties 节点终止该分支（任意值/标量叶子下钻 = 空候选，不抛错）', () => {
        for (const expr of ['remark.', 'orderNo.', 'customer.name.']) {
            const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr })
            expect(result).toMatchObject({ ok: true, candidates: [] })
        }
    })

    it('$index 标量无子候选；头部部分段 $ind 仅行上下文给', () => {
        const drill = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: '$index.', rowSchema })
        expect(drill).toMatchObject({ ok: true, candidates: [] })
        const rootHeads = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: '$ind' })
        if (!rootHeads.ok) throw new Error('应枚举成功')
        expect(rootHeads.candidates.map((candidate) => candidate.segment)).not.toContain('$index')
        const rowHeads = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: '$ind', rowSchema })
        if (!rowHeads.ok) throw new Error('应枚举成功')
        expect(rowHeads.candidates.map((candidate) => candidate.segment)).toContain('$index')
    })

    it('row. 行外不给（求值期 expression_row_outside_loop）→ 空候选', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'row.' })
        expect(result).toMatchObject({ ok: true, candidates: [] })
        const deeper = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'row.label' })
        expect(deeper).toMatchObject({ ok: true, candidates: [] })
    })

    it('partial 恒为 expr 的后缀（接受替换契约：尾点态空后缀、部分段即尾段）', () => {
        const queries = [
            { context: 'row', expr: 'row.', rowSchema },
            { context: 'row', expr: 'row.lab', rowSchema },
            { context: 'row', expr: 'lab', rowSchema },
            { context: 'row', expr: '', rowSchema },
            { context: 'root', expr: '$root.customer.' },
            { context: 'root', expr: '$root.customer.na' },
        ] as const
        for (const query of queries) {
            const result = enumerateExpressionCandidates(payloadSchema, query)
            if (!result.ok) throw new Error('应枚举成功')
            expect(query.expr.endsWith(result.partial), `${query.expr} 的 partial "${result.partial}" 应为后缀`).toBe(true)
        }
    })
})

describe('enumerateExpressionCandidates（语法错误信号）', () => {
    it('路径空段（row..x）/ 孤点（.）→ ok:false expression_syntax_error', () => {
        for (const expr of ['row..x', '.', 'customer..name']) {
            expect(enumerateExpressionCandidates(payloadSchema, { context: 'row', expr, rowSchema })).toEqual({
                ok: false,
                reason: 'expression_syntax_error',
            })
        }
    })
})

describe('enumerateExpressionCandidates（降级态：声明被拒/非法 → 全部无候选）', () => {
    it('schema null：任何 expr 都空候选、不抛错', () => {
        for (const query of [
            { context: 'root', expr: '' },
            { context: 'row', expr: 'row.', rowSchema },
            { context: 'root', expr: '$root.customer.' },
        ] as const) {
            expect(enumerateExpressionCandidates(null, query)).toMatchObject({ ok: true, candidates: [] })
        }
    })

    it('schema 为空声明（properties: {}）：结构头仍在、无键候选', () => {
        const parsed = parseExpressionSchema({ properties: {} })
        if (!parsed.ok) throw new Error('应解析通过')
        const result = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.map((candidate) => candidate.segment)).toEqual(['$root'])
    })
})

describe('宿主示例信封 schema 的载荷形态用例（评估文档 §1.1）', () => {
    /** SimpleMockDataSource 信封 {id, name, data}——若宿主把信封当 dataset 声明 */
    const envelopeRaw = (withDataProperties: boolean) => ({
        type: 'object',
        properties: {
            id: { type: 'string', description: '数据源 ID' },
            name: { type: 'string', description: '数据源名称' },
            data: withDataProperties
                ? {
                      type: 'object',
                      description: '业务载荷',
                      properties: {
                          orderNo: { type: 'string', description: '订单号' },
                          total: { type: 'number', description: '订单金额' },
                      },
                  }
                : { type: 'object', description: '业务载荷（未声明形状）' },
        },
    })

    it('data 位无 properties：根候选 = 信封三键，data. 之后无下钻（根上下文候选极薄）', () => {
        const parsed = parseExpressionSchema(envelopeRaw(false))
        if (!parsed.ok) throw new Error('应解析通过')
        const heads = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.candidates.map((candidate) => candidate.path)).toEqual(['id', 'name', 'data', '$root'])
        const drill = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: 'data.' })
        expect(drill).toMatchObject({ ok: true, candidates: [] })
    })

    it('data 位声明具体 properties 后候选有实感：data. 给出载荷键树（未过滤位不给桶候选）', () => {
        const parsed = parseExpressionSchema(envelopeRaw(true))
        if (!parsed.ok) throw new Error('应解析通过')
        const drill = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: 'data.' })
        if (!drill.ok) throw new Error('应枚举成功')
        expect(drill.candidates).toEqual([
            { path: 'data.orderNo', segment: 'orderNo', description: '订单号', type: 'string', kind: 'path' },
            { path: 'data.total', segment: 'total', description: '订单金额', type: 'number', kind: 'path' },
        ])
        // partial 非空（data.tot 收敛中）→ total 的数字族桶候选出现
        const narrowing = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: 'data.tot' })
        if (!narrowing.ok) throw new Error('应枚举成功')
        expect(narrowing.candidates.filter((candidate) => candidate.type === '函数').map((fn) => fn.segment)).toEqual([
            'number(data.total)',
            'fixed(data.total)',
            'percent(data.total)',
        ])
    })

    it('D1 推荐形态（载荷直传）：schema 根 = 载荷键，根上下文头部即业务键', () => {
        const parsed = parseExpressionSchema(payloadSchemaRaw)
        if (!parsed.ok) throw new Error('应解析通过')
        const heads = enumerateExpressionCandidates(parsed.schema, { context: 'root', expr: '' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.candidates.map((candidate) => candidate.segment)).toEqual([
            'orderNo',
            'customer',
            'tags',
            'remark',
            '$root',
        ])
    })
})

describe('enumerateExpressionCandidates（内建函数建议面，expression-type-methods 工单 12，spec §1.2 ⑨）', () => {
    it('函数名候选只喂补全建议：片段以名字形态开头（非空裸名）时给四函数', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'tag' })
        if (!result.ok) throw new Error('应枚举成功')
        const fns = result.candidates.filter((candidate) => candidate.type === '函数')
        expect(fns.map((fn) => fn.segment)).toEqual(['date()', 'number()', 'fixed()', 'percent()'])
        expect(fns[0]).toMatchObject({
            segment: 'date()',
            cursorBack: 1,
            path: 'date(path[, format])',
            description: '日期格式化（moment 风格 token，预设 date/datetime）',
        })
    })

    it('空 expr / 尾点下钻位不给函数名候选（片段以名字开头才建议；字段列表零噪音）', () => {
        const empty = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: '' })
        if (!empty.ok) throw new Error('应枚举成功')
        expect(empty.candidates.some((candidate) => candidate.type === '函数')).toBe(false)
        const drill = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'customer.' })
        if (!drill.ok) throw new Error('应枚举成功')
        expect(drill.candidates.some((candidate) => candidate.type === '函数')).toBe(false)
    })

    it('分桶：format 标记 string → date() 插入调用（参数占位 + 光标回退引号内）；replaceLen = 整段 expr', () => {
        const result = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'issueDate' })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.partial).toBe('issueDate')
        const plain = result.candidates.find((candidate) => candidate.segment === 'issueDate')
        expect(plain).toMatchObject({ path: 'issueDate', type: 'string' }) // 路径候选照给
        const call = result.candidates.find((candidate) => candidate.filterKey === 'issueDate')
        expect(call).toMatchObject({
            segment: "date(issueDate, '')",
            cursorBack: 2,
            replaceLen: 9,
            filterKey: 'issueDate',
            type: '函数',
        })
    })

    it('分桶：number → 数字族三函数；普通 string 不特供任何日期/数字建议（工单 11 ②）', () => {
        const amount = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'amount' })
        if (!amount.ok) throw new Error('应枚举成功')
        expect(amount.candidates.filter((candidate) => candidate.filterKey === 'amount').map((fn) => fn.segment)).toEqual([
            'number(amount)',
            'fixed(amount)',
            'percent(amount)',
        ])
        const name = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'name' })
        if (!name.ok) throw new Error('应枚举成功')
        // 普通 string 自身无桶（head 层全量列表可含其他字段的桶，按 filterKey 区分）
        expect(name.candidates.some((candidate) => candidate.filterKey === 'name')).toBe(false)
    })

    it('分桶在下钻层同样生效（replaceLen 覆盖含前缀的整段 expr）', () => {
        const drill = enumerateExpressionCandidates(bucketRow, {
            context: 'row',
            expr: 'row.iss',
            rowSchema: bucketRow,
        })
        if (!drill.ok) throw new Error('应枚举成功')
        expect(drill.partial).toBe('iss')
        const call = drill.candidates.find((candidate) => candidate.filterKey === 'issueDate')
        expect(call).toMatchObject({ segment: "date(row.issueDate, '')", replaceLen: 7 })
    })

    it('调用首参槽：字段建议复用路径枚举（上下文同源），桶候选与函数名候选不在参数位给（调用不嵌套）', () => {
        const heads = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'date(' })
        if (!heads.ok) throw new Error('应枚举成功')
        expect(heads.candidates.map((candidate) => candidate.segment)).toEqual(['issueDate', 'amount', 'name', '$root'])
        expect(heads.partial).toBe('')

        const drill = enumerateExpressionCandidates(bucketRow, {
            context: 'row',
            expr: 'date(row.iss',
            rowSchema: bucketRow,
        })
        if (!drill.ok) throw new Error('应枚举成功')
        expect(drill.partial).toBe('iss')
        expect(drill.candidates.map((candidate) => candidate.segment)).toEqual(['issueDate', 'amount', 'name']) // 纯路径候选
    })

    it('date 格式串槽：具名预设 + 中文模板快捷项（spec §3.4，与求值面预设解耦）', () => {
        const result = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: "date(issueDate, 'Y" })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.partial).toBe('Y')
        expect(result.candidates).toEqual([
            { path: 'date', segment: 'date', description: '预设 → YYYY-MM-DD', type: '格式' },
            { path: 'datetime', segment: 'datetime', description: '预设 → YYYY-MM-DD HH:mm:ss', type: '格式' },
            { path: 'YYYY年MM月DD日', segment: 'YYYY年MM月DD日', description: '中文模板（写即所得）', type: '格式' },
        ])
    })

    it('非建议槽位/闭合调用/嵌套调用形态：空候选（ok 不变，不抛错）', () => {
        for (const expr of ['date(issueDate)', 'number(amount, ', "date(issueDate, '')", 'date(foo(']) {
            const result = enumerateExpressionCandidates(bucketRow, { context: 'root', expr })
            expect(result).toMatchObject({ ok: true, candidates: [] })
        }
    })

    it('行外 row. 出现在调用首参槽同样不给（row. 行外报错语义不因调用面松动）', () => {
        const result = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'date(row.' })
        expect(result).toMatchObject({ ok: true, candidates: [] })
    })
})

describe('候选 kind 判别（resource-expression-single-ref 工单 03）：显式分桶替代启发式', () => {
    /**
     * ADR 0020 资源面：路径选择器（工单 05）按 `kind === 'path'` 过滤函数桶——
     * 不用 filterKey/含 ( 启发式（工单 12 内部约定不作契约）。path = 字段/结构头
     * （$root/row/$index），function = 函数名建议 + 形状分桶调用插入；date 格式
     * 快捷项两桶皆非（kind 缺省——建议面其余桶，资源面天然不出现）。
     */
    it('头部候选全量带 kind: path（字段 + $root/row/$index 结构头）', () => {
        const result = enumerateExpressionCandidates(payloadSchema, { context: 'row', expr: '', rowSchema })
        if (!result.ok) throw new Error('应枚举成功')
        expect(result.candidates.every((candidate) => candidate.kind === 'path')).toBe(true)
        expect(result.candidates.map((candidate) => candidate.segment)).toContain('$root')
        expect(result.candidates.map((candidate) => candidate.segment)).toContain('row')
        expect(result.candidates.map((candidate) => candidate.segment)).toContain('$index')
    })

    it('下钻路径候选带 kind: path；同键函数桶候选带 kind: function（显式字段，不靠 filterKey/括号启发式）', () => {
        const result = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'amount' })
        if (!result.ok) throw new Error('应枚举成功')
        const path = result.candidates.find((candidate) => candidate.segment === 'amount')
        expect(path).toMatchObject({ path: 'amount', kind: 'path' })
        const fns = result.candidates.filter((candidate) => candidate.segment === 'number(amount)')
        expect(fns).toHaveLength(1)
        expect(fns[0]).toMatchObject({ kind: 'function', filterKey: 'amount' })
    })

    it('函数名建议候选带 kind: function；date 格式快捷项两桶皆非（kind 缺省）', () => {
        const narrowing = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'issueDate' })
        if (!narrowing.ok) throw new Error('应枚举成功')
        expect(narrowing.candidates.find((candidate) => candidate.segment === 'issueDate')).toMatchObject({ kind: 'path' })
        expect(narrowing.candidates.find((candidate) => candidate.segment === "date(issueDate, '')")).toMatchObject({ kind: 'function' })

        const fnNames = enumerateExpressionCandidates(payloadSchema, { context: 'root', expr: 'tag' })
        if (!fnNames.ok) throw new Error('应枚举成功')
        expect(fnNames.candidates.filter((candidate) => candidate.kind === 'function').map((fn) => fn.segment)).toEqual([
            'date()',
            'number()',
            'fixed()',
            'percent()',
        ])

        const formatSlot = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: "date(issueDate, 'Y" })
        if (!formatSlot.ok) throw new Error('应枚举成功')
        expect(formatSlot.candidates.map((candidate) => candidate.kind)).toEqual([undefined, undefined, undefined])
    })

    it('选择器消费形态：kind === path 过滤后零函数桶（路径候选全量保留，过滤归浮层面）', () => {
        const narrowing = enumerateExpressionCandidates(bucketRow, { context: 'root', expr: 'iss' })
        if (!narrowing.ok) throw new Error('应枚举成功')
        const paths = narrowing.candidates.filter((candidate) => candidate.kind === 'path')
        expect(paths.map((candidate) => candidate.segment)).toEqual(['issueDate', 'amount', 'name', '$root'])
        expect(paths.some((candidate) => candidate.type === '函数')).toBe(false)
    })
})
