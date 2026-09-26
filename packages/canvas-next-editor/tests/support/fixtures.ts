/**
 * 测试夹具：6 种图层的最小合法构造器。字段缺省回填严格类型的默认值，
 * 用例只覆写关注的字段（工单 06 起 editor 侧测试共用）。
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
    TextLayer,
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
