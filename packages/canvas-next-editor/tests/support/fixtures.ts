/**
 * 测试夹具：6 种图层的最小合法构造器。字段缺省回填严格类型的默认值，
 * 用例只覆写关注的字段（工单 06 起 editor 侧测试共用）。
 *
 * 末尾另有模板态表格的 canonical wire 造数器（工票 02）：领域构造器造不出
 * 「行模板 + rows 恒空」的合法域形态（那是解码的产物），经 decodeGraph 打开。
 */
import type {
    Align,
    ImageLayer,
    Layer,
    Position,
    QrCodeLayer,
    Shape,
    TableLayer,
    TableCellLayer,
    TableRowLayer,
    TableRowTemplateLayer,
    TextLayer,
    WireLayerNode,
} from '@hankchen/canvas-next'

const defaultShape = (): Shape => ({
    width: 100,
    height: 50,
    autoWidth: false,
    autoHeight: false,
    lineHeight: 1.2,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    border: { top: null, bottom: null, left: null, right: null },
    backgroundColor: null,
})

/** 组合覆写：非嵌套字段整值替换，shape/align/position 允许深层缺省合并 */
type LayerOverrides<T extends Layer> = Partial<Omit<T, 'type' | 'shape' | 'align' | 'position'>> & {
    shape?: Partial<Shape>
    align?: Partial<Align>
    position?: Partial<Position>
}

function withOverrides<T extends Layer>(base: T, overrides: LayerOverrides<T>): T {
    return {
        ...base,
        ...overrides,
        shape: overrides.shape ? { ...base.shape, ...overrides.shape } : base.shape,
        align: overrides.align ? { ...base.align, ...overrides.align } : base.align,
        position: overrides.position ? { ...base.position, ...overrides.position } : base.position,
    } as T
}

export function textLayer(overrides: LayerOverrides<TextLayer> = {}): TextLayer {
    return withOverrides(
        {
            type: 'TextLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: defaultShape(),
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            text: '你好画布',
            expression: null,
            font: '',
            fontSize: 16,
            fontColor: '#111827',
            angle: 0,
            autowrap: false,
        },
        overrides,
    )
}

export function imageLayer(overrides: LayerOverrides<ImageLayer> = {}): ImageLayer {
    return withOverrides(
        {
            type: 'ImageLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: defaultShape(),
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            src: null,
            expression: null,
        },
        overrides,
    )
}

export function qrLayer(overrides: LayerOverrides<QrCodeLayer> = {}): QrCodeLayer {
    return withOverrides(
        {
            type: 'QrCodeLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: defaultShape(),
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            value: 'canvas-web',
            expression: null,
        },
        overrides,
    )
}

export function cellLayer(
    content: Layer | null,
    overrides: LayerOverrides<TableCellLayer> = {},
): TableCellLayer {
    return withOverrides(
        {
            type: 'TableCellLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: defaultShape(),
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            content,
        },
        overrides,
    )
}

export function rowLayer(
    cells: readonly TableCellLayer[],
    overrides: LayerOverrides<TableRowLayer> = {},
): TableRowLayer {
    return withOverrides(
        {
            type: 'TableRowLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: defaultShape(),
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            cells,
        },
        overrides,
    )
}

/** 行模板（TableLayer V2 声明态）：纯结构造数（扫描等只读消费，声明高耦合归解码） */
export function rowTemplateLayer(
    cells: readonly TableCellLayer[],
    overrides: LayerOverrides<TableRowTemplateLayer> = {},
): TableRowTemplateLayer {
    return withOverrides(
        {
            type: 'TableRowTemplate',
            name: '',
            visible: true,
            priority: 10,
            shape: defaultShape(),
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            cells,
        },
        overrides,
    )
}

export function tableLayer(
    rows: readonly TableRowLayer[],
    overrides: LayerOverrides<TableLayer> = {},
): TableLayer {
    return withOverrides(
        {
            type: 'TableLayer',
            name: '',
            visible: true,
            priority: 10,
            shape: defaultShape(),
            align: { horizontal: 'left', vertical: 'top' },
            position: { anchor: 'top-left', x: 0, y: 0 },
            template: null,
            rowsPath: '',
            rows,
        },
        overrides,
    )
}

// ---- wire 造数器（工票 02 起 editor 侧测试共用） ----

const WIRE_SHAPE_REST = {
    lineHeight: 1,
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    border: { top: null, bottom: null, left: null, right: null },
    backgroundColor: null,
} as const

/** canonical 全量 shape（键级对齐 graph() 输出；extra 覆写 autoHeight 等标志） */
export function shapeWire(width: number, height: number, extra: Record<string, unknown> = {}) {
    return { width, height, autoWidth: false, autoHeight: false, ...WIRE_SHAPE_REST, ...extra }
}

export const ALIGN_TOP_LEFT = { horizontal: 'left' as const, vertical: 'top' as const }
export const POSITION_ORIGIN = { x: 0, y: 0, position: 'top-left' as const }

/**
 * canonical wire 节点：shape 必给，spec 其余键缺省 top-left/原点；overrides 落
 * 节点级键（priority/data/cells/template…），specOverrides 并入 spec（fontFamily、
 * 非 top-left 对齐等）。
 */
export function wireNode(
    type: WireLayerNode['type'],
    shape: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
    specOverrides: Record<string, unknown> = {},
): WireLayerNode {
    return {
        type,
        priority: 0,
        spec: { shape, align: ALIGN_TOP_LEFT, position: POSITION_ORIGIN, ...specOverrides },
        ...overrides,
    }
}

/**
 * 模板态表格 canonical wire（工票 02，spec §2.5 缩样）：表 320×120 + data.rowsPath +
 * 行模板（320 宽、高 0 autoHeight），三格内容层各带 ExpressionValue 标记（值字段恒
 * 镜像 expression 原文）；行/格/内容声明高与 autoHeight 豁免原样落键（spec §2.3）。
 * 宽度耦合已按解码形态落键：行模板行宽=表宽、内容宽=格宽——decode→encode 恒等。
 */
export function templateTableWire(): WireLayerNode {
    return wireNode('TableLayer', shapeWire(320, 120), {
        priority: 10,
        data: { rowsPath: 'order.items' },
        template: wireNode('TableRowTemplate', shapeWire(320, 0, { autoHeight: true }), {
            cells: [
                wireNode('TableCellLayer', shapeWire(160, 0, { autoHeight: true }), {
                    content: wireNode('TextLayer', shapeWire(160, 0, { autoHeight: true }), {
                        data: { valueType: 'ExpressionValue', expression: '姓名：{{row.name}}', value: '姓名：{{row.name}}' },
                    }, {
                        align: { horizontal: 'left', vertical: 'bottom' },
                        fontFamily: { font: '', fontSize: 12, fontColor: '#000000', angle: 0, autowrap: false },
                    }),
                }),
                wireNode('TableCellLayer', shapeWire(160, 40), {
                    content: wireNode('ImageLayer', shapeWire(160, 40), {
                        data: { valueType: 'ExpressionValue', expression: '{{row.avatar}}', value: '{{row.avatar}}' },
                    }),
                }),
                wireNode('TableCellLayer', shapeWire(160, 40), {
                    content: wireNode('QrCodeLayer', shapeWire(160, 40), {
                        data: { valueType: 'ExpressionValue', expression: '{{row.code}}', value: '{{row.code}}' },
                    }),
                }),
            ],
        }),
    })
}
