import { describe, expect, it } from 'vitest'

import { parseExpressionSchema, resolveRowSchema, schemaChildEntries, schemaNodeAtPath } from '../../src/shared/expressionSchema'
import { CERT_FORM_DATASET_SCHEMA } from './certFormDatasetSchema'

/**
 * 证书 form-data schema 全链路（content-completion 工单 08，spec §5 真实 fixture）：
 * draft-07 全树 deref 零诊断，形状树覆盖全部嵌套分支（机构/学员/培训/章节树/课件/
 * 开放映射），$ref 菱形/嵌套/前向与内联等价，definitions 命名池不进候选树。
 */

const parsed = parseExpressionSchema(CERT_FORM_DATASET_SCHEMA)
if (!parsed.ok) throw new Error(`证书 schema 应编译通过：${parsed.reason}: ${parsed.detail}`)
const schema = parsed.schema

describe('证书 form-data schema（真实 fixture，工单 08）', () => {
    it('全树 deref 零诊断（D7：合法方言无局部故障）', () => {
        expect(parsed.ok).toBe(true)
        expect(parsed.diagnostics).toEqual([])
    })

    it('根级 13 键全可达，definitions 命名池不进候选树', () => {
        const keys = schemaChildEntries(schema).map((entry) => entry.key)
        expect(keys).toHaveLength(13)
        expect(keys).toEqual([
            'certName',
            'certNo',
            'issueDate',
            'org',
            'student',
            'training',
            'chapters',
            'coursewares',
            'originCertificates',
            'fields',
            'attachments',
            'remark',
            'printSettings',
        ])
    })

    it('机构分支：$ref 基底 + 嵌套引用（org.contact），本地 description 覆盖目标注解', () => {
        expect(schemaNodeAtPath(schema, ['org', 'name'])).toMatchObject({ type: 'string', description: '机构名称' })
        expect(schemaNodeAtPath(schema, ['org', 'contact', 'phone'])).toMatchObject({ type: 'string', description: '联系电话' })
        const org = schemaNodeAtPath(schema, ['org'])
        expect(org?.title).toBe('机构信息') // 基底 title 保留（本地未声明 title）
        expect(org?.description).toBe('颁证机构（本地描述叠加目标基底）') // 本地覆盖/叠加
        expect(schemaNodeAtPath(schema, ['org', 'logo'])).toMatchObject({
            type: 'string',
            description: '机构 Logo（本地描述覆盖目标注解）', // 兄弟 description 覆盖目标 imageUrl 的 description
        })
    })

    it('学员分支：菱形引用第二落点等价内联', () => {
        expect(schemaNodeAtPath(schema, ['student', 'name'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['student', 'photo'])).toMatchObject({
            type: 'string',
            description: '学员证件照', // 与 org.logo 共享 imageUrl 定义，各自叠加本地描述
        })
        expect(schemaNodeAtPath(schema, ['student', 'idNumber'])).toMatchObject({ type: 'string' })
    })

    it('培训分支：内联对象树照常', () => {
        expect(schemaNodeAtPath(schema, ['training', 'courseName'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['training', 'totalHours'])).toMatchObject({ type: 'number' })
    })

    it('章节树分支：前向引用 deref + 两级 items 链下钻', () => {
        const chapters = schemaNodeAtPath(schema, ['chapters'])
        expect(chapters?.type).toBe('array')
        expect(schemaNodeAtPath(schema, ['chapters', 'title'])).toMatchObject({ type: 'string', description: '章节标题' })
        expect(schemaNodeAtPath(schema, ['chapters', 'sections', 'title'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['chapters', 'sections', 'durationMinutes'])).toMatchObject({ type: 'number' })
        expect(resolveRowSchema(schema, 'chapters')?.properties?.has('title')).toBe(true)
    })

    it('课件分支：数组 items 引用 + 菱形第三落点', () => {
        expect(schemaNodeAtPath(schema, ['coursewares', 'name'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['coursewares', 'mediaType'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['coursewares', 'fileUrl'])).toMatchObject({ type: 'string', description: '课件文件地址' })
    })

    it('原始证书数组：徽标 array，items 引用树可达', () => {
        const origin = schemaNodeAtPath(schema, ['originCertificates'])
        expect(origin?.type).toBe('array')
        expect(schemaNodeAtPath(schema, ['originCertificates', 'certNo'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['originCertificates', 'fileUrl'])).toMatchObject({ type: 'string', description: '证书扫描件' })
    })

    it('开放映射 fields：open 标记入形状树，无 properties（键候选归枚举层处置）', () => {
        const fields = schemaNodeAtPath(schema, ['fields'])
        expect(fields?.open).toBe(true)
        expect(fields?.properties).toBeUndefined()
        expect(schemaChildEntries(fields as NonNullable<typeof fields>)).toEqual([])
    })

    it('打印设置：enum/format 等校验关键词宽松忽略，type 照常归一', () => {
        expect(schemaNodeAtPath(schema, ['printSettings', 'paperSize'])).toMatchObject({ type: 'string' })
        expect(schemaNodeAtPath(schema, ['printSettings', 'watermark'])).toMatchObject({ type: 'string', description: '图片资源 URL' })
    })

    it('title 透出：根与分支 title 入形状树（展示回落归浮层，工单 10）', () => {
        expect(schema.title).toBe('证书 form-data 载荷')
        expect(schemaNodeAtPath(schema, ['printSettings'])?.title).toBe('打印设置')
        expect(schemaNodeAtPath(schema, ['certName'])?.title).toBeUndefined()
    })
})
