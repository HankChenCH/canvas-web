/**
 * 查找替换纯函数（canvas-web-find-replace 工单 01，CONTEXT「查找替换」词条）：
 *
 * - scanTextMatches：全画布未标记（expression === null）TextLayer.text 的大小写
 *   敏感子串扫描——视觉序 = 数组尾→头（hitTest 同门），表格两形态参与（V1 rows
 *   格内容 + 模板态 template.cells 格内容），隐藏层参与，标记字段整字段豁免，
 *   QrCode.value / ImageLayer.src / 层名不参与，同字段多命中按序偏移对。
 * - replaceHitsInDraft：in-draft 替换助手——原文快照命中 + 同字段偏移降序应用
 *   （替换产物不重扫），空替换串 = 删除命中串，写值 expression 保持 null。
 */
import { describe, expect, it } from 'vitest'
import { produce } from 'immer'

import type { Canvas, TableLayer } from '@hankchen/canvas'

import {
    replaceHitsInDraft,
    scanTextMatches,
    type FindTextHit,
} from '../../src/editing/findReplace'
import {
    cellLayer,
    imageLayer,
    qrLayer,
    rowLayer,
    rowTemplateLayer,
    tableLayer,
    textLayer,
} from '../support/fixtures'

const doc = (layers: Canvas['layers']): Canvas => ({ width: 800, height: 600, layers })

/** 命中列表投影成 [path, start, end] 便于断言 */
const hitKey = ({ path, start, end }: FindTextHit): unknown[] => [[...path], start, end]

describe('scanTextMatches：匹配语义', () => {
    it('空 query 恒零命中（查找条初态空转）；未命中同样零命中', () => {
        const canvas = doc([textLayer({ text: '春季班' })])
        expect(scanTextMatches(canvas, '')).toEqual([])
        expect(scanTextMatches(canvas, '秋季')).toEqual([])
    })

    it('单命中：字段路径 + 偏移对 [start, end)', () => {
        const canvas = doc([textLayer({ text: '2026 春季班' })])
        expect(scanTextMatches(canvas, '春季').map(hitKey)).toEqual([[['layers', 0], 5, 7]])
    })

    it('大小写敏感：Spring 不命中 spring（中文模板改字为主场景，敏感比不敏感可预测）', () => {
        const canvas = doc([textLayer({ text: 'spring Spring' })])
        expect(scanTextMatches(canvas, 'Spring').map(hitKey)).toEqual([[['layers', 0], 7, 13]])
        expect(scanTextMatches(canvas, 'SPRING')).toEqual([])
    })

    it('同字段多命中按序偏移对；相邻命中不重叠（"aaa" 查 "aa" 得 [0,2) 一处）', () => {
        const canvas = doc([textLayer({ text: '春假春季春季春' })])
        expect(scanTextMatches(canvas, '春季').map(hitKey)).toEqual([
            [['layers', 0], 2, 4],
            [['layers', 0], 4, 6],
        ])
        expect(scanTextMatches(doc([textLayer({ text: 'aaa' })]), 'aa').map(hitKey)).toEqual([
            [['layers', 0], 0, 2],
        ])
    })

    it('未标记字段整串字面直通：串内 {{ 也按字面参与（数据表达式词条边界）', () => {
        const canvas = doc([textLayer({ text: '静态{{literal}}' })])
        expect(scanTextMatches(canvas, '{{').map(hitKey)).toEqual([[['layers', 0], 2, 4]])
    })
})

describe('scanTextMatches：对象面与豁免边界（spec 决策 1）', () => {
    it('标记字段整字段豁免：expression 非 null 的 text 即使含查询串也不命中', () => {
        const canvas = doc([
            textLayer({ text: '姓名{{row.name}}', expression: '姓名{{row.name}}' }),
        ])
        expect(scanTextMatches(canvas, 'row')).toEqual([])
        expect(scanTextMatches(canvas, '{{')).toEqual([])
    })

    it('QrCode.value / ImageLayer.src / 层名不参与；未标记 text 是唯一对象面', () => {
        const canvas = doc([
            qrLayer({ value: 'canvas-web' }),
            imageLayer({ src: 'canvas-web.png' }),
            textLayer({ name: 'canvas-web', text: '横幅' }),
        ])
        expect(scanTextMatches(canvas, 'canvas-web')).toEqual([])
    })

    it('隐藏层参与扫描（隐藏是渲染排除语义非保护语义）', () => {
        const canvas = doc([
            textLayer({ visible: false, text: '藏甲' }),
            textLayer({ text: '显甲' }),
        ])
        expect(scanTextMatches(canvas, '甲').map(hitKey)).toEqual([
            [['layers', 1], 1, 2],
            [['layers', 0], 1, 2],
        ])
    })
})

describe('scanTextMatches：视觉序（数组尾→头，hitTest 同门）', () => {
    it('根层数组尾→头：视觉最上层先命中', () => {
        const canvas = doc([
            textLayer({ priority: 10, text: '命中底' }),
            textLayer({ priority: 20, text: '命中顶' }),
        ])
        expect(scanTextMatches(canvas, '命中').map(hitKey)).toEqual([
            [['layers', 1], 0, 2],
            [['layers', 0], 0, 2],
        ])
    })

    it('V1 rows 格内容参与：rows/cells 尾→头下钻，路径落在格内容', () => {
        const canvas = doc([
            tableLayer([
                rowLayer([cellLayer(textLayer({ text: '行0甲' })), cellLayer(textLayer({ text: '行0乙甲' }))]),
                rowLayer([cellLayer(textLayer({ text: '行1甲' }))]),
            ]),
        ])
        expect(scanTextMatches(canvas, '甲').map(hitKey)).toEqual([
            [['layers', 0, 'rows', 1, 'cells', 0, 'content'], 2, 3],
            [['layers', 0, 'rows', 0, 'cells', 1, 'content'], 3, 4],
            [['layers', 0, 'rows', 0, 'cells', 0, 'content'], 2, 3],
        ])
    })

    it('模板态 template.cells 格内容参与（path 含 template 段）；标记格同表豁免', () => {
        const canvas = doc([
            tableLayer([], {
                rowsPath: 'data.rows',
                template: rowTemplateLayer([
                    cellLayer(textLayer({ text: '姓名{{row.name}}', expression: '姓名{{row.name}}' })),
                    cellLayer(textLayer({ text: '模板row行' })),
                ]),
            }),
        ])
        expect(scanTextMatches(canvas, 'row').map(hitKey)).toEqual([
            [['layers', 0, 'template', 'cells', 1, 'content'], 2, 5],
        ])
    })
})

describe('replaceHitsInDraft：in-draft 替换助手（原文快照语义）', () => {
    it('同字段多命中按偏移降序应用：长度变化的替换不串位', () => {
        const canvas = doc([textLayer({ text: 'abab' })])
        const hits = scanTextMatches(canvas, 'ab')
        const next = produce(canvas, (draft) => {
            expect(replaceHitsInDraft(draft, hits, 'XYZ')).toBe(2)
        })
        expect((next.layers[0] as { text: string }).text).toBe('XYZXYZ')
    })

    it('快照定位：替换产物不重扫——replacement 含查询串不死循环，一次应用', () => {
        const canvas = doc([textLayer({ text: '春' })])
        const hits = scanTextMatches(canvas, '春')
        const next = produce(canvas, (draft) => {
            expect(replaceHitsInDraft(draft, hits, '春季')).toBe(1)
        })
        expect((next.layers[0] as { text: string }).text).toBe('春季')
    })

    it('空替换串 = 删除命中串', () => {
        const canvas = doc([textLayer({ text: '你好世界' })])
        const hits = scanTextMatches(canvas, '世界')
        const next = produce(canvas, (draft) => {
            replaceHitsInDraft(draft, hits, '')
        })
        expect((next.layers[0] as { text: string }).text).toBe('你好')
    })

    it('写值 text 直写 + expression 保持 null（与文本编辑提交同门）；跨字段命中各自落地', () => {
        const canvas = doc([
            textLayer({ text: '甲春季' }),
            tableLayer([rowLayer([cellLayer(textLayer({ text: '春季乙' }))])]),
        ])
        const hits = scanTextMatches(canvas, '春季')
        const next = produce(canvas, (draft) => {
            expect(replaceHitsInDraft(draft, hits, '秋季')).toBe(2)
        })
        const rootLayer = next.layers[0] as { text: string; expression: string | null }
        expect(rootLayer.text).toBe('甲秋季')
        expect(rootLayer.expression).toBeNull()
        const content = (next.layers[1] as TableLayer).rows[0]!.cells[0]!.content as { text: string }
        expect(content.text).toBe('秋季乙')
    })

    it('失效快照命中静默跳过（路径不可解析）：零应用、文档不动', () => {
        const canvas = doc([textLayer({ text: '春季' })])
        const stale: FindTextHit[] = [{ path: ['layers', 5], start: 0, end: 2 }]
        const next = produce(canvas, (draft) => {
            expect(replaceHitsInDraft(draft, stale, '秋')).toBe(0)
        })
        expect(next).toEqual(canvas)
    })
})
