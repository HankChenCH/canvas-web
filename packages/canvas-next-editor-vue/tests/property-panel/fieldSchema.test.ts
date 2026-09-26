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

const fieldKeys = (sections: readonly { title: string; fields: readonly FieldDef[] }[]): string[] =>
    flatFields(sections).map((f) => f.key.join('.'))

describe('type 标识 ↔ 注册表映射', () => {
    it('7 种 type 全部有注册表条目，且恰为 LAYER_TYPES 全集（无多余条目）', () => {
        expect(Object.keys(FIELD_SECTIONS_BY_TYPE).sort()).toEqual([...LAYER_TYPES].sort())
        // 行模板（V2）无编辑字段（绑定面板属 fog）：注册表占位空清单
        for (const type of LAYER_TYPES) {
            if (type === 'TableRowTemplate') continue
            expect(fieldSectionsForType(type).length).toBeGreaterThan(0)
        }
        expect(fieldSectionsForType('TableRowTemplate')).toEqual([])
    })

    it('每种 type 的每个字段 key 都能在该 type 的领域实例上解析（路径与文档模型同步）', () => {
        for (const type of LAYER_TYPES) {
            const layer = layerByType(type)
            for (const key of fieldKeys(fieldSectionsForType(type))) {
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
})

describe('权威字段过滤（visibleWhen：注册表有、当前层不可编辑）', () => {
    it('autoWidth/autoHeight 时隐藏 width/height 输入', () => {
        const layer = { ...layerByType('TextLayer'), shape: { ...baseLayer().shape, autoWidth: true, autoHeight: true } }
        const keys = fieldKeys(fieldSectionsForPath(['layers', 0], layer))
        expect(keys).not.toContain('shape.width')
        expect(keys).not.toContain('shape.height')
        expect(keys).toContain('shape.autoWidth')
        expect(keys).toContain('shape.autoHeight')
    })

    it('lineHeight 只在 TextLayer 出现（形状段共享、文本专属字段按类型显隐）', () => {
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], layerByType('TextLayer')))).toContain('shape.lineHeight')
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], layerByType('ImageLayer')))).not.toContain('shape.lineHeight')
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], layerByType('TableLayer')))).not.toContain('shape.lineHeight')
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
