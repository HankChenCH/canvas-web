import { describe, expect, it } from 'vitest'

import {
    ANCHORS,
    HORIZONTAL_ALIGNS,
    LAYER_TYPES,
    VERTICAL_ALIGNS,
    type Border,
    type Layer,
    type LayerType,
    type Padding,
} from '@hankchen/canvas-next-editor'

import {
    CANVAS_FIELD_SECTIONS,
    FIELD_SECTIONS_BY_TYPE,
    fieldSectionsForPath,
    fieldSectionsForType,
    layerRoleAt,
    readField,
    type FieldDef,
} from '../../src/property-panel/fieldSchema'

// ---- 测试夹具：6 种 type 的最小合法领域构造（对齐 editor 包 fixtures 的形态） ----

const padding = (v: number): Padding => ({ top: v, bottom: v, left: v, right: v })
const noBorder = (): Border => ({ top: null, bottom: null, left: null, right: null })

const baseLayer = () => ({
    // name/visible 缺省态（layer-panel-ux 工单 01）
    name: '',
    visible: true,
    priority: 10,
    shape: {
        width: 100,
        height: 50,
        autoWidth: false,
        autoHeight: false,
        lineHeight: 1.2,
        padding: padding(0),
        border: noBorder(),
        backgroundColor: null,
    },
    align: { horizontal: 'left', vertical: 'top' } as const,
    position: { anchor: 'top-left', x: 0, y: 0 } as const,
})

const layerByType = (type: LayerType): Layer => {
    switch (type) {
        case 'ImageLayer':
            return { type, ...baseLayer(), src: null, expression: null }
        case 'TextLayer':
            return {
                type,
                ...baseLayer(),
                text: '文',
                expression: null,
                font: '',
                fontSize: 16,
                fontColor: '#000000',
                angle: 0,
                autowrap: false,
            }
        case 'QrCodeLayer':
            return { type, ...baseLayer(), value: 'payload', expression: null }
        case 'TableRowLayer':
            return { type, ...baseLayer(), cells: [] }
        case 'TableRowTemplate':
            return { type, ...baseLayer(), cells: [] }
        case 'TableCellLayer':
            return { type, ...baseLayer(), content: null }
        case 'TableLayer':
            return { type, ...baseLayer(), template: null, rowsPath: '', rows: [] }
    }
}

/** 展开后的字段清单（section 拍平，便于断言） */
const flatFields = (sections: readonly { title: string; fields: readonly FieldDef[] }[]): FieldDef[] =>
    sections.flatMap((s) => [...s.fields])

/** 拍平的字段键（pair 子字段按 `pair键.子键` 绝对键展开，工票 03） */
const fieldKeys = (sections: readonly { title: string; fields: readonly FieldDef[] }[]): string[] =>
    sections.flatMap((s) =>
        s.fields.flatMap((f) => [f.key.join('.'), ...(f.items ?? []).map((it) => [...f.key, ...it.key].join('.'))]),
    )

describe('type 标识 ↔ 注册表映射', () => {
    it('7 种 type 全部有注册表条目，且恰为 LAYER_TYPES 全集（无多余条目）', () => {
        expect(Object.keys(FIELD_SECTIONS_BY_TYPE).sort()).toEqual([...LAYER_TYPES].sort())
        // 行模板字段组（spec §2.2 D6）：高 + 高自适应——宽度由表宽同步不渲染
        for (const type of LAYER_TYPES) {
            expect(fieldSectionsForType(type).length).toBeGreaterThan(0)
        }
        const templateSections = fieldSectionsForType('TableRowTemplate')
        expect(templateSections).toHaveLength(1)
        expect(fieldKeys(templateSections)).toEqual(['shape.height', 'shape.autoHeight'])
    })

    it('每种 type 实际渲染的每个字段 key 都能在该 type 的领域实例上解析（路径与文档模型同步）', () => {
        // 用 fieldSectionsForPath（visibleWhen 过滤后的渲染面）断言：type 共享组里
        // 被 visibleWhen 门控的字段（如 angle）只在门控 type 上要求可解析
        for (const type of LAYER_TYPES) {
            const layer = layerByType(type)
            for (const key of fieldKeys(fieldSectionsForPath(['layers', 0], layer))) {
                const read = readField(layer, key.split('.'))
                expect([type, key, read.ok]).toEqual([type, key, true])
            }
        }
    })

    it('数据字段与各 type 的领域数据字段一一对应（updateData 的分派面）', () => {
        const dataKeys = (type: LayerType): string[] =>
            flatFields(fieldSectionsForType(type))
                .filter((f) => f.data)
                .map((f) => f.key.join('.'))
        expect(dataKeys('TextLayer')).toEqual(['text'])
        expect(dataKeys('ImageLayer')).toEqual(['src'])
        expect(dataKeys('QrCodeLayer')).toEqual(['value'])
        expect(dataKeys('TableLayer')).toEqual([])
        expect(dataKeys('TableRowLayer')).toEqual([])
        expect(dataKeys('TableRowTemplate')).toEqual([])
        expect(dataKeys('TableCellLayer')).toEqual([])
    })

    it('未知 type 返回空清单且不抛（不告警刷屏的注册表侧语义）', () => {
        expect(fieldSectionsForType('LegacyLayer')).toEqual([])
        expect(fieldSectionsForType('')).toEqual([])
    })

    it('枚举取值域直接引用领域常量（不自创缩写）', () => {
        const sections = fieldSectionsForType('TextLayer')
        const horizontal = flatFields(sections).find((f) => f.key.join('.') === 'align.horizontal')
        const anchor = flatFields(sections).find((f) => f.key.join('.') === 'position.anchor')
        expect(horizontal?.domain).toEqual(HORIZONTAL_ALIGNS)
        expect(anchor?.control).toBe('anchor')
        // anchor 控件的九宫取值域由 AnchorField 消费 ANCHORS；注册表侧不做第二份拷贝
        expect(ANCHORS).toHaveLength(9)
        expect(VERTICAL_ALIGNS).toEqual(['top', 'center', 'bottom'])
    })

    it('对齐两字段注册为分段图标控件（工单 05：不再走 select 下拉），值域不变', () => {
        const find = (type: LayerType): { horizontal: FieldDef; vertical: FieldDef } => {
            const fields = flatFields(fieldSectionsForType(type))
            return {
                horizontal: fields.find((f) => f.key.join('.') === 'align.horizontal')!,
                vertical: fields.find((f) => f.key.join('.') === 'align.vertical')!,
            }
        }
        for (const type of ['ImageLayer', 'TextLayer', 'QrCodeLayer', 'TableLayer', 'TableRowLayer', 'TableCellLayer'] as const) {
            const { horizontal, vertical } = find(type)
            expect([type, horizontal.control, vertical.control]).toEqual([type, 'align', 'align'])
        }
        expect(find('TextLayer').horizontal.domain).toEqual(HORIZONTAL_ALIGNS)
        expect(find('TextLayer').vertical.domain).toEqual(VERTICAL_ALIGNS)
    })
})

describe('权威字段过滤（visibleWhen：注册表有、当前层不可编辑）', () => {
    it('autoWidth/autoHeight 时 width/height 仍渲染（禁用与替代显示归控件层，schema 不再隐藏）', () => {
        const layer = { ...layerByType('TextLayer'), shape: { ...baseLayer().shape, autoWidth: true, autoHeight: true } }
        const keys = fieldKeys(fieldSectionsForPath(['layers', 0], layer))
        expect(keys).toContain('shape.width')
        expect(keys).toContain('shape.height')
    })

    it('lineHeight 只在 TextLayer 出现（形状段共享、文本专属字段按类型显隐）', () => {
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], layerByType('TextLayer')))).toContain('shape.lineHeight')
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], layerByType('ImageLayer')))).not.toContain('shape.lineHeight')
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], layerByType('TableLayer')))).not.toContain('shape.lineHeight')
    })
})

describe('位置与尺寸组重排（layer-panel-ux 工票 03：两列行 + auto prefix + angle 迁入）', () => {
    const findField = (sections: readonly { title: string; fields: readonly FieldDef[] }[], key: string): FieldDef | undefined =>
        flatFields(sections).find((f) => f.key.join('.') === key)

    it('section 更名「位置与尺寸」，X|Y 与 宽|高 各为一个 pair 字段（语义行）', () => {
        const sections = fieldSectionsForType('TextLayer')
        const position = sections.find((s) => s.title === '位置与尺寸')
        expect(position).toBeDefined()
        const xy = findField([position!], 'position')
        const wh = findField([position!], 'shape')
        expect(xy?.control).toBe('pair')
        expect(wh?.control).toBe('pair')
        expect(xy?.items?.map((i) => i.key.join('.'))).toEqual(['x', 'y'])
        expect(wh?.items?.map((i) => i.key.join('.'))).toEqual(['width', 'height'])
        // 行内 label 自描述（语义行不再复用整行大标签说明列含义）
        expect(xy?.items?.map((i) => i.label)).toEqual(['X', 'Y'])
        expect(wh?.items?.map((i) => i.label)).toEqual(['宽', '高'])
    })

    it('宽/高子字段带自适应 prefix 描述符：auto 指向 pair 值对象上的布尔键', () => {
        const wh = findField(fieldSectionsForType('ImageLayer'), 'shape')!
        const width = wh.items?.find((i) => i.key.join('.') === 'width')
        const height = wh.items?.find((i) => i.key.join('.') === 'height')
        expect(width?.auto?.key).toEqual(['autoWidth'])
        expect(height?.auto?.key).toEqual(['autoHeight'])
        // 「自动」是盒未解析时的兜底占位（正常路径面板传 layerBoxAt 解析值，工单 04）
        expect(width?.auto?.placeholder).toBe('自动')
        // 数值约束跟随子字段（整数、非负），提交约束不回归
        expect(width?.integer).toBe(true)
        expect(width?.min).toBe(0)
        expect(height?.integer).toBe(true)
        expect(height?.min).toBe(0)
    })

    it('autoWidth/autoHeight 独立 BooleanField 行撤销（并入 prefix；行模板组除外——spec §2.2 D6 两字段形态）', () => {
        for (const type of LAYER_TYPES) {
            const keys = fieldKeys(fieldSectionsForType(type))
            expect(keys, type).not.toContain('shape.autoWidth')
            if (type === 'TableRowTemplate') continue
            expect(keys, type).not.toContain('shape.autoHeight')
        }
    })

    it('angle 迁入位置与尺寸组（TextLayer 专属 visibleWhen 不变），文本组移除', () => {
        const sections = fieldSectionsForType('TextLayer')
        const position = sections.find((s) => s.title === '位置与尺寸')!
        const angle = findField([position], 'angle')
        expect(angle?.control).toBe('number')
        expect(angle?.integer).toBe(true)
        expect(angle?.visibleWhen?.(layerByType('TextLayer'))).toBe(true)
        expect(angle?.visibleWhen?.(layerByType('ImageLayer'))).toBe(false)
        // 非 Text 类型渲染面上无 angle（visibleWhen 门控）；文本组不再携带 angle
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], layerByType('ImageLayer')))).not.toContain('angle')
        const text = sections.find((s) => s.title === '文本')!
        expect(fieldKeys([text])).not.toContain('angle')
    })

    it('锚点仍以 anchor 控件字段在场（块级折叠区渲染归面板路由）', () => {
        const anchor = findField(fieldSectionsForType('TableLayer'), 'position.anchor')
        expect(anchor?.control).toBe('anchor')
    })

    it('位置行 X/Y 子字段保持整数数值语义', () => {
        const xy = findField(fieldSectionsForType('QrCodeLayer'), 'position')!
        for (const item of xy.items ?? []) {
            expect(item.control).toBe('number')
            expect(item.integer).toBe(true)
        }
    })
})

describe('容器角色的权威过滤（解码强同步字段不渲染：改了会被改回去）', () => {
    it('路径角色判定：root/row/cell/content', () => {
        expect(layerRoleAt(['layers', 0])).toBe('root')
        expect(layerRoleAt(['layers', 0, 'rows', 1])).toBe('row')
        expect(layerRoleAt(['layers', 0, 'rows', 1, 'cells', 0])).toBe('cell')
        expect(layerRoleAt(['layers', 0, 'rows', 1, 'cells', 0, 'content'])).toBe('content')
    })

    it('行宽被 addRow 强制同步表宽：row 角色隐藏 width/autoWidth，其余保留', () => {
        const row = layerByType('TableRowLayer')
        const keys = fieldKeys(fieldSectionsForPath(['layers', 0, 'rows', 0], row))
        expect(keys).not.toContain('shape.width')
        expect(keys).not.toContain('shape.autoWidth')
        expect(keys).toContain('shape.height')
        expect(keys).toContain('shape.backgroundColor')
    })

    it('格内容的宽高都被解码压平：content 角色隐藏 width/height/auto 全族', () => {
        const content = layerByType('TextLayer')
        const keys = fieldKeys(fieldSectionsForPath(['layers', 0, 'rows', 0, 'cells', 0, 'content'], content))
        expect(keys).not.toContain('shape.width')
        expect(keys).not.toContain('shape.autoWidth')
        expect(keys).not.toContain('shape.height')
        expect(keys).not.toContain('shape.autoHeight')
        expect(keys).toContain('text')
        expect(keys).toContain('shape.padding')
    })

    it('cell 角色不隐藏尺寸（行高取最高格是解码期副作用，运行期格宽高仍是活字段）', () => {
        const cell = layerByType('TableCellLayer')
        const keys = fieldKeys(fieldSectionsForPath(['layers', 0, 'rows', 0, 'cells', 1], cell))
        expect(keys).toContain('shape.width')
        expect(keys).toContain('shape.height')
    })

    it('模板格内容（templateContent）：宽度同步隐藏、高度豁免放行（决策 2026-09）', () => {
        const content = layerByType('TextLayer')
        expect(layerRoleAt(['layers', 0, 'template', 'cells', 0, 'content'])).toBe('templateContent')
        const sections = fieldSectionsForPath(['layers', 0, 'template', 'cells', 0, 'content'], content)
        const keys = fieldKeys(sections)
        expect(keys).not.toContain('shape.width')
        expect(keys).not.toContain('shape.autoWidth')
        expect(keys).toContain('shape.height')
        // 高度豁免 = 尺寸行只剩高子字段、且带 autoHeight prefix（独立布尔行已撤销）
        const size = flatFields(sections).find((f) => f.key.join('.') === 'shape')
        expect(size?.items?.map((i) => i.key.join('.'))).toEqual(['height'])
        expect(size?.items?.[0]?.auto?.key).toEqual(['autoHeight'])
        // 模板格本身 = cell 角色，尺寸全放行
        const cellKeys = fieldKeys(fieldSectionsForPath(['layers', 0, 'template', 'cells', 0], layerByType('TableCellLayer')))
        expect(cellKeys).toContain('shape.width')
        expect(cellKeys).toContain('shape.height')
    })

    it('同一 type 在根层与容器内呈现不同字段集（过滤按 path+layer 联合判定）', () => {
        const text = layerByType('TextLayer')
        const rootKeys = fieldKeys(fieldSectionsForPath(['layers', 2], text))
        const contentKeys = fieldKeys(fieldSectionsForPath(['layers', 0, 'rows', 0, 'cells', 0, 'content'], text))
        expect(rootKeys).toContain('shape.width')
        expect(contentKeys).not.toContain('shape.width')
    })

    it('过滤后空 section 不输出（不渲染空标题）', () => {
        // 构造：把 TextLayer 塞进 content 角色 —— 文本 section 永不空，但形状段仍剩
        // padding/border 等；真正可能空的场景用自定义窄表验证（此处验证实现语义：
        // fields 过滤后 length 0 的 section 不出现在结果里）
        const sections = fieldSectionsForPath(['layers', 0], layerByType('QrCodeLayer'))
        for (const section of sections) {
            expect(section.fields.length).toBeGreaterThan(0)
        }
    })
})

describe('padding 行静态文案（placeholder-padding-hint 工单 01：作用于内容盒、不改图层尺寸）', () => {
    const PADDING_COPY = '内边距作用于内容盒，不改变图层尺寸'

    it('有 padding 行的全部图层型该行 title 携带静态文案，可见 label 不动（文案走悬停 title）', () => {
        for (const type of LAYER_TYPES) {
            const field = flatFields(fieldSectionsForPath(['layers', 0], layerByType(type))).find(
                (f) => f.key.join('.') === 'shape.padding',
            )
            // 行模板替身无形状组（只有高/高自适应），padding 行本就不在场
            if (type === 'TableRowTemplate') {
                expect(field, type).toBeUndefined()
                continue
            }
            expect(field, type).toBeDefined()
            expect(field!.label, type).toBe('内边距')
            expect(field!.title, type).toBe(PADDING_COPY)
        }
    })

    it('title 不扩散：全注册表仅 shape.padding 一处携带（含 pair 子字段；共享 section 按 key 去重）', () => {
        const titled = new Set<string>()
        for (const sections of Object.values(FIELD_SECTIONS_BY_TYPE)) {
            for (const section of sections) {
                for (const field of section.fields) {
                    if (field.title !== undefined) titled.add(field.key.join('.'))
                    for (const item of field.items ?? []) {
                        if (item.title !== undefined) titled.add(`${field.key.join('.')}.${item.key.join('.')}`)
                    }
                }
            }
        }
        expect([...titled]).toEqual(['shape.padding'])
    })
})

describe('readField：字段值读取（未知路径不渲染、不告警的面板侧依据）', () => {
    it('深层路径命中返回值', () => {
        const layer = layerByType('TextLayer')
        expect(readField(layer, ['shape', 'backgroundColor'])).toEqual({ ok: true, value: null })
        expect(readField(layer, ['fontSize'])).toEqual({ ok: true, value: 16 })
    })

    it('路径悬空/中途非对象返回 ok:false', () => {
        expect(readField(null, ['shape', 'width']).ok).toBe(false)
        expect(readField(layerByType('TextLayer'), ['nope', 'deep']).ok).toBe(false)
        expect(readField(layerByType('TextLayer'), ['shape', 'nope']).ok).toBe(false)
    })
})

describe('画布级字段（未选中图层时的面板内容）', () => {
    it('宽/高两个整数数值字段，相对画布根解析', () => {
        const keys = fieldKeys(CANVAS_FIELD_SECTIONS)
        expect(keys).toEqual(['width', 'height'])
        for (const field of flatFields(CANVAS_FIELD_SECTIONS)) {
            expect(field.control).toBe('number')
            expect(field.integer).toBe(true)
        }
        expect(readField({ width: 2400, height: 1500 }, ['width'])).toEqual({ ok: true, value: 2400 })
    })
})

// ---- 模板创作（spec §2.2 D6 / §2.4）：替身字段组与 rowsPath 显隐 ----

describe('fieldSectionsForPath：模板态（模板创作 spec）', () => {
    const templateTable: Layer = {
        type: 'TableLayer',
        name: '',
        visible: true,
        priority: 10,
        shape: {
            width: 600,
            height: 200,
            autoWidth: false,
            autoHeight: false,
            lineHeight: 1.2,
            padding: padding(0),
            border: noBorder(),
            backgroundColor: null,
        },
        align: { horizontal: 'left', vertical: 'top' } as const,
        position: { anchor: 'top-left', x: 0, y: 0 } as const,
        rowsPath: 'order.items',
        rows: [],
        template: {
            type: 'TableRowTemplate',
            name: '',
            visible: true,
            priority: 0,
            shape: {
                width: 600,
                height: 0,
                autoWidth: false,
                autoHeight: true,
                lineHeight: 1.2,
                padding: padding(0),
                border: noBorder(),
                backgroundColor: null,
            },
            align: { horizontal: 'left', vertical: 'top' } as const,
            position: { anchor: 'top-left', x: 0, y: 0 } as const,
            cells: [],
        },
    }

    it('行模板替身路径渲染 height/autoHeight 字段组（宽度不出现）', () => {
        const sections = fieldSectionsForPath(['layers', 0, 'template'], templateTable.template!)
        const keys = fieldKeys(sections)
        expect(keys).toContain('shape.height')
        expect(keys).toContain('shape.autoHeight')
        expect(keys).not.toContain('shape.width')
        expect(keys).not.toContain('shape.autoWidth')
    })

    it('rowsPath 仅模板态显示：V1 表无数据节，模板态表出现且带 nonEmpty/占位', () => {
        const v1: Layer = { ...templateTable, template: null, rowsPath: '' }
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], v1))).not.toContain('rowsPath')

        const dataSection = fieldSectionsForPath(['layers', 0], templateTable).find((s) => s.title === '数据')!
        const rowsPath = dataSection.fields.find((f) => f.key[0] === 'rowsPath')!
        expect(rowsPath.nonEmpty).toBe(true)
        expect(rowsPath.placeholder).toBeTruthy()
    })

    it('rowsPath 字段带 rowsPath 补全标记（工单 03，D6 标记门）：全注册表唯一', () => {
        const dataSection = fieldSectionsForPath(['layers', 0], templateTable).find((s) => s.title === '数据')!
        const rowsPath = dataSection.fields.find((f) => f.key[0] === 'rowsPath')!
        expect(rowsPath.completion).toBe('rowsPath')

        // 标记不扩散：其余字段（含 data 门三字段）一个不带
        const marked: string[] = []
        for (const sections of Object.values(FIELD_SECTIONS_BY_TYPE)) {
            for (const section of sections) {
                for (const field of section.fields) {
                    if (field.completion !== undefined) marked.push(field.key.join('.'))
                    for (const item of field.items ?? []) {
                        if (item.completion !== undefined) marked.push(`${field.key.join('.')}.${item.key.join('.')}`)
                    }
                }
            }
        }
        expect(marked).toEqual(['rowsPath'])
    })
})
