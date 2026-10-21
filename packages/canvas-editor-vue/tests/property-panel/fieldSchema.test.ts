import { describe, expect, it } from 'vitest'

import {
    ANCHORS,
    HORIZONTAL_ALIGNS,
    LAYER_TYPES,
    VERTICAL_ALIGNS,
    type Border,
    type Canvas,
    type Layer,
    type LayerType,
    type Padding,
} from '@hankchen/canvas-editor'

import {
    CANVAS_FIELD_SECTIONS,
    FIELD_SECTIONS_BY_TYPE,
    UNDRAWN_CONTENT_HINT,
    canvasFieldTarget,
    fieldSectionsForPath,
    fieldSectionsForType,
    layerFieldTarget,
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
        // 被 visibleWhen 门控的字段（如 angle）只在门控 type 上要求可解析。
        // 面板读目标经 layerFieldTarget 投影（fit 缺省 → cover 回显，image-fit 工单
        // 05；canvas-background 的 canvasFieldTarget 同门），本断言随同投影
        for (const type of LAYER_TYPES) {
            const layer = layerByType(type)
            for (const key of fieldKeys(fieldSectionsForPath(['layers', 0], layer))) {
                const read = readField(layerFieldTarget(layer), key.split('.'))
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

    it('图片资源地址注册为上传控件（imageSrc：缩略图回显 + 上传 + 紧凑路径行），仍走 data 门', () => {
        const src = flatFields(fieldSectionsForType('ImageLayer')).find((f) => f.key.join('.') === 'src')!
        expect(src.control).toBe('imageSrc')
        expect(src.data).toBe(true)
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

describe('适配字段（image-fit 工单 05，ADR 0023）', () => {
    const imageLayer = (): Extract<Layer, { type: 'ImageLayer' }> => layerByType('ImageLayer') as Extract<Layer, { type: 'ImageLayer' }>

    it('IMAGE 区段 src 之后追加 fit（适配）；其余 type 无此字段', () => {
        const imageSection = fieldSectionsForType('ImageLayer').find((s) => s.title === '图片')!
        expect(imageSection.fields.map((f) => f.key.join('.'))).toEqual(['src', 'fit', 'clip'])
        for (const type of ['TextLayer', 'QrCodeLayer', 'TableLayer'] as const) {
            expect(fieldKeys(fieldSectionsForType(type))).not.toContain('fit')
        }
    })

    it('fit 字段描述：select 控件、四档值域 + 中文选项、静态声明无表达式态（ADR 0024）', () => {
        const fit = flatFields(fieldSectionsForType('ImageLayer')).find((f) => f.key[0] === 'fit')!
        expect(fit.control).toBe('select')
        expect(fit.domain).toEqual(['cover', 'contain', 'fill', 'tile'])
        expect(fit.optionLabels).toEqual({
            cover: '铺满裁切',
            contain: '完整显示',
            fill: '拉伸铺满',
            tile: '平铺',
        })
        // 静态声明：不带 data/resource 标记——无取值方式段，提交走 updateSpec
        expect(fit.data).toBeUndefined()
        expect(fit.resource).toBeUndefined()
    })

    it('layerFieldTarget：fit 缺省投影为 cover 回显；双字段已声明（含未知值）/非图片层原样透传', () => {
        // 缺省态（wire 无 fit 键）：投影补 cover，readField 命中（否则字段被过滤不渲染）
        const bare = imageLayer()
        expect(bare.fit).toBeUndefined()
        expect(readField(layerFieldTarget(bare), ['fit'])).toEqual({ ok: true, value: 'cover' })

        // 双字段齐备：引用透传（未知值显示交给控件域外行为，投影不越权归一；
        // clip 缺省也会触发拷贝——投影以「两个可缺省字段齐备」为透传门）
        const contained = { ...bare, fit: 'contain', clip: 'circle' }
        expect(layerFieldTarget(contained)).toBe(contained)
        const unknown = { ...bare, fit: 'seventies', clip: 'star' }
        expect(layerFieldTarget(unknown)).toBe(unknown)

        const text = layerByType('TextLayer')
        expect(layerFieldTarget(text)).toBe(text)
    })
})

describe('裁剪形状字段（image-clip-shape 工票 05，ADR 0026）', () => {
    const imageLayer = (): Extract<Layer, { type: 'ImageLayer' }> => layerByType('ImageLayer') as Extract<Layer, { type: 'ImageLayer' }>

    it('IMAGE 区段 src/fit 之后追加 clip（殿后语义与 wire 键序同门）；其余 type 无此字段', () => {
        const imageSection = fieldSectionsForType('ImageLayer').find((s) => s.title === '图片')!
        expect(imageSection.fields.map((f) => f.key.join('.'))).toEqual(['src', 'fit', 'clip'])
        for (const type of ['TextLayer', 'QrCodeLayer', 'TableLayer'] as const) {
            expect(fieldKeys(fieldSectionsForType(type))).not.toContain('clip')
        }
    })

    it('clip 字段描述：select 控件、二档值域 + 中文选项、静态声明无表达式态', () => {
        const clip = flatFields(fieldSectionsForType('ImageLayer')).find((f) => f.key[0] === 'clip')!
        expect(clip.control).toBe('select')
        expect(clip.domain).toEqual(['rect', 'circle'])
        expect(clip.optionLabels).toEqual({ rect: '矩形', circle: '圆形' })
        // 静态声明：不带 data/resource 标记——无取值方式段，提交走 updateSpec
        expect(clip.data).toBeUndefined()
        expect(clip.resource).toBeUndefined()
    })

    it('layerFieldTarget：clip 缺省投影为 rect 回显（fit 缺省投影同门）；双字段齐备/非图片层原样透传', () => {
        // 缺省态（wire 无 clip 键）：投影补 rect，readField 命中（否则字段被过滤不渲染）
        const bare = imageLayer()
        expect(bare.clip).toBeUndefined()
        expect(readField(layerFieldTarget(bare), ['clip'])).toEqual({ ok: true, value: 'rect' })

        // 双字段齐备：引用透传（未知值显示不越权归一，渲染面降级矩形归核心臂）
        const circled = { ...bare, clip: 'circle', fit: 'contain' }
        expect(layerFieldTarget(circled)).toBe(circled)
        const unknown = { ...bare, clip: 'star', fit: 'cover' }
        expect(layerFieldTarget(unknown)).toBe(unknown)

        const text = layerByType('TextLayer')
        expect(layerFieldTarget(text)).toBe(text)
    })

    it('fit 与 clip 双缺省一次投影补齐（两字段互不覆盖）', () => {
        const bare = imageLayer()
        const target = layerFieldTarget(bare)
        expect(readField(target, ['fit'])).toEqual({ ok: true, value: 'cover' })
        expect(readField(target, ['clip'])).toEqual({ ok: true, value: 'rect' })
        // fit 已声明时 clip 缺省仍投影
        const fitted = { ...bare, fit: 'contain' }
        const fittedTarget = layerFieldTarget(fitted)
        expect(readField(fittedTarget, ['fit'])).toEqual({ ok: true, value: 'contain' })
        expect(readField(fittedTarget, ['clip'])).toEqual({ ok: true, value: 'rect' })
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
        const canvasSection = CANVAS_FIELD_SECTIONS.filter((s) => s.title === '画布')
        const keys = fieldKeys(canvasSection)
        expect(keys).toEqual(['width', 'height'])
        for (const field of flatFields(canvasSection)) {
            expect(field.control).toBe('number')
            expect(field.integer).toBe(true)
        }
        expect(readField({ width: 2400, height: 1500 }, ['width'])).toEqual({ ok: true, value: 2400 })
    })

    it('背景区段：背景色（nullable color）+ 背景图（imageSrc，非 data 字段无表达式态）', () => {
        const bg = CANVAS_FIELD_SECTIONS.find((s) => s.title === '背景')!
        expect(bg.fields.map((f) => f.key.join('.'))).toEqual(['background.color', 'background.image'])
        const color = bg.fields[0]!
        expect(color.control).toBe('color')
        expect(color.nullable).toBe(true)
        const image = bg.fields[1]!
        expect(image.control).toBe('imageSrc')
        // 背景静态（spec Q3）：非 data 字段，无取值方式段
        expect(image.data).toBeUndefined()
    })

    it('canvasFieldTarget：background null 投影全空值对象（清空态字段可读、区段恒渲染）', () => {
        expect(canvasFieldTarget(null)).toBeNull()
        const empty = canvasFieldTarget({ width: 100, height: 80, background: null, layers: [] })
        expect(readField(empty, ['background', 'color'])).toEqual({ ok: true, value: null })
        expect(readField(empty, ['background', 'image'])).toEqual({ ok: true, value: null })
        // 已设背景原样透出（不拷贝、不重整）
        const set: Canvas = { width: 100, height: 80, background: { color: '#ffffff', image: null }, layers: [] }
        expect(canvasFieldTarget(set)).toBe(set)
        expect(readField(canvasFieldTarget(set), ['background', 'color'])).toEqual({ ok: true, value: '#ffffff' })
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

    it('rowsPath 仅模板态显示：V1 表无数据节，模板态表出现且为点选器控件（label 翻新「取行路径」，rows-path-picker 工单 03）', () => {
        const v1: Layer = { ...templateTable, template: null, rowsPath: '' }
        expect(fieldKeys(fieldSectionsForPath(['layers', 0], v1))).not.toContain('rowsPath')

        const dataSection = fieldSectionsForPath(['layers', 0], templateTable).find((s) => s.title === '数据')!
        const rowsPath = dataSection.fields.find((f) => f.key[0] === 'rowsPath')!
        expect(rowsPath.control).toBe('rowsPath')
        expect(rowsPath.label).toBe('取行路径')
        // 手输缝退役随换装：非空校验与占位文案是文本输入面概念，点选器不消费
        expect(rowsPath.nonEmpty).toBeUndefined()
        expect(rowsPath.placeholder).toBeUndefined()
        // 补全标记随换装撤除（FieldDef.completion 已整体退役，编译器即防回流护栏）
        expect('completion' in rowsPath).toBe(false)
    })
})

describe('padding 行动态提示（placeholder-padding-hint 工单 02：占位态内容未绘制）', () => {
    // 文案同源断言：直接引 schema 导出常量，字面漂移即编译错（工单 01 测试文案收 const 同款）
    const UNDRAWN_HINT = UNDRAWN_CONTENT_HINT
    const paddingRow = (type: LayerType): FieldDef =>
        flatFields(fieldSectionsForPath(['layers', 0], layerByType(type))).find(
            (f) => f.key.join('.') === 'shape.padding',
        )!

    it('占位态三态命中：表达式标记/物化未达 done/内容盒 ≤0 的图片层返回提示文案', () => {
        const hint = paddingRow('ImageLayer').hint!
        const statuses = { 'assets/logo.png': 'pending' } as const
        // ① 表达式标记（设计态最常见，demo 的 {{org.logo}}；文档 src 恒镜像原文）
        expect(hint({ ...layerByType('ImageLayer'), src: '{{org.logo}}', expression: '{{org.logo}}' } as Layer, statuses)).toBe(UNDRAWN_HINT)
        // ② 物化 pending/failed（静态引用在册但未达 done）
        const staticLayer = { ...layerByType('ImageLayer'), src: 'assets/logo.png' } as Layer
        expect(hint(staticLayer, statuses)).toBe(UNDRAWN_HINT)
        expect(hint(staticLayer, { 'assets/logo.png': 'failed' })).toBe(UNDRAWN_HINT)
        // ③ 内容盒 ≤0（解码清零的自适应声明尺寸）
        const auto = layerByType('ImageLayer')
        ;(auto.shape as { width: number }).width = 0
        expect(hint(auto, { 'assets/logo.png': 'done' })).toBe(UNDRAWN_HINT)
    })

    it('静态可加载图片层与文本层不提示（done/无记录求值 null）——验收反例', () => {
        const hint = paddingRow('ImageLayer').hint!
        const staticLayer = { ...layerByType('ImageLayer'), src: 'assets/logo.png' } as Layer
        expect(hint(staticLayer, { 'assets/logo.png': 'done' })).toBeNull()
        expect(hint(staticLayer, {})).toBeNull()
        // hint 谓词对非图片层恒 null（内核判定面只属于图片层）
        expect(hint(layerByType('TextLayer'), {})).toBeNull()
    })

    it('hint 不扩散：全注册表仅 shape.padding 一处携带（含 pair 子字段；共享 section 按 key 去重）', () => {
        const hinted = new Set<string>()
        for (const sections of Object.values(FIELD_SECTIONS_BY_TYPE)) {
            for (const section of sections) {
                for (const field of section.fields) {
                    if (field.hint !== undefined) hinted.add(field.key.join('.'))
                    for (const item of field.items ?? []) {
                        if (item.hint !== undefined) hinted.add(`${field.key.join('.')}.${item.key.join('.')}`)
                    }
                }
            }
        }
        expect([...hinted]).toEqual(['shape.padding'])
    })
})
