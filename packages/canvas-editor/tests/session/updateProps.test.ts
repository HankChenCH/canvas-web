import { describe, expect, it, vi } from 'vitest'

import { encodeLayer, type Canvas } from '@hankchen/canvas'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { imageLayer, qrLayer, tableLayer, textLayer } from '../support/fixtures'
import { cellLayer, rowLayer } from '../support/fixtures'

/** 同步手动调度器：测试里不真正驱动重绘，只让会话可构造 */
const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(doc: Canvas): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument(doc)
    return editor
}

const docWith = (layers: Canvas['layers']): Canvas => ({
    width: 800,
    height: 600,
    layers,
})

const textDoc = () => docWith([textLayer({ position: { anchor: 'top-left', x: 10, y: 20 } })])

describe('updateSpec：按图层路径 + 字段路径写 spec 子树（工单 09 权威写入口）', () => {
    it('深层字段写入生效，patch path = 图层路径 ⊕ 字段路径', () => {
        const editor = makeEditor(textDoc())
        const changes: unknown[] = []
        editor.subscribe((c) => changes.push(c))
        changes.length = 0

        editor.updateSpec(['layers', 0], ['shape', 'backgroundColor'], '#ff0000')

        expect(editor.store.doc!.layers[0]!.shape.backgroundColor).toBe('#ff0000')
        expect(changes).toEqual([
            {
                scope: 'doc',
                patches: [
                    { path: ['layers', 0, 'shape', 'backgroundColor'], op: 'replace', value: '#ff0000' },
                ],
                inversePatches: [
                    { path: ['layers', 0, 'shape', 'backgroundColor'], op: 'replace', value: null },
                ],
            },
        ])
    })

    it('字段路径可为单段（领域平铺字段，如 TextLayer 的 fontSize）', () => {
        const editor = makeEditor(textDoc())
        editor.updateSpec(['layers', 0], ['fontSize'], 42)
        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.fontSize).toBe(42)
    })

    it('值不变时空转：不进历史、不通知', () => {
        const editor = makeEditor(textDoc())
        const listener = vi.fn()
        editor.subscribe(listener)

        editor.updateSpec(['layers', 0], ['position', 'x'], 10)

        expect(editor.store.history).toHaveLength(0)
        expect(listener).not.toHaveBeenCalled()
    })

    it('图层路径解析失败（越界/形态不符）静默空转', () => {
        const editor = makeEditor(textDoc())
        expect(() => {
            editor.updateSpec(['layers', 9], ['position', 'x'], 1)
            editor.updateSpec(['layers'], ['position', 'x'], 1)
            editor.updateSpec(['layers', 'x' as unknown as number], ['position', 'x'], 1)
        }).not.toThrow()
        expect(editor.store.history).toHaveLength(0)
    })

    it('字段路径悬空（中间段不存在）不写入也不抛', () => {
        const editor = makeEditor(textDoc())
        expect(() => editor.updateSpec(['layers', 0], ['shape', 'nope', 'deeper'], 1)).not.toThrow()
        expect(editor.store.history).toHaveLength(0)
    })

    it('mergeKey 相同的连续字段事务合并为一步历史', () => {
        const editor = makeEditor(textDoc())
        const mk = 'sel:layers.0:position.x'

        editor.updateSpec(['layers', 0], ['position', 'x'], 30, { mergeKey: mk })
        editor.updateSpec(['layers', 0], ['position', 'x'], 50, { mergeKey: mk })

        expect(editor.store.history).toHaveLength(1)
        editor.store.closeMerge(mk)
        editor.updateSpec(['layers', 0], ['position', 'x'], 70, { mergeKey: mk })
        expect(editor.store.history).toHaveLength(2)
    })

    it('不同字段各自为一步（面板按字段路径给 mergeKey 的语义锁定）', () => {
        const editor = makeEditor(textDoc())
        editor.updateSpec(['layers', 0], ['position', 'x'], 30, { mergeKey: 'sel:layers.0:position.x' })
        editor.updateSpec(['layers', 0], ['position', 'y'], 40, { mergeKey: 'sel:layers.0:position.y' })
        expect(editor.store.history).toHaveLength(2)
    })

    it('结构化值整体替换（padding 四键对象一次写入）', () => {
        const editor = makeEditor(textDoc())
        const padding = { top: 1, bottom: 2, left: 3, right: 4 }
        editor.updateSpec(['layers', 0], ['shape', 'padding'], padding)
        expect(editor.store.doc!.layers[0]!.shape.padding).toEqual(padding)
    })
})

describe('updateData：数据字段写入（data.value 的领域展开，按 type 分派）', () => {
    it('TextLayer 写 text', () => {
        const editor = makeEditor(textDoc())
        editor.updateData(['layers', 0], '新文案')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('新文案')
    })

    it('TextLayer 的 null 归空串（宽进对齐解码语义）', () => {
        const editor = makeEditor(textDoc())
        editor.updateData(['layers', 0], null)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('')
    })

    it('ImageLayer 空串与 null 归 null（PHP setImage 语义）', () => {
        const editor = makeEditor(docWith([imageLayer({ src: '/a.png' })]))
        editor.updateData(['layers', 0], '')
        expect(editor.store.doc!.layers[0]!.type === 'ImageLayer' && editor.store.doc!.layers[0]!.src).toBeNull()

        editor.updateData(['layers', 0], '/b.png')
        expect(editor.store.doc!.layers[0]!.type === 'ImageLayer' && editor.store.doc!.layers[0]!.src).toBe('/b.png')

        editor.updateData(['layers', 0], null)
        expect(editor.store.doc!.layers[0]!.type === 'ImageLayer' && editor.store.doc!.layers[0]!.src).toBeNull()
    })

    it('QrCodeLayer 写 value', () => {
        const editor = makeEditor(docWith([qrLayer()]))
        editor.updateData(['layers', 0], 'https://example.com')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'QrCodeLayer' && layer.value).toBe('https://example.com')
    })

    // ---- 字面写解除标记（工票 02，镜像 PHP 三内容层 setter） ----

    it('标记文本编辑 → expression 置 null，encode 回 StaticValue 三键 expression:\'\'', () => {
        const expression = '姓名：{{row.name}}'
        const editor = makeEditor(docWith([textLayer({ text: expression, expression })]))

        editor.updateData(['layers', 0], '字面文案')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('字面文案')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()

        const data = encodeLayer(layer).data as Record<string, unknown>
        expect(data.valueType).toBe('StaticValue')
        expect(Object.keys(data)).toEqual(['valueType', 'expression', 'value'])
        expect(data.expression).toBe('')
        expect(data.value).toBe('字面文案')
    })

    it('标记图片编辑 → expression 置 null，encode 回两键（无 expression 键）', () => {
        const editor = makeEditor(docWith([imageLayer({ src: '{{row.avatar}}', expression: '{{row.avatar}}' })]))

        editor.updateData(['layers', 0], '/literal.png')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.src).toBe('/literal.png')
        expect(layer.type === 'ImageLayer' && layer.expression).toBeNull()

        const data = encodeLayer(layer).data as Record<string, unknown>
        expect(Object.keys(data)).toEqual(['valueType', 'value'])
        expect(data.valueType).toBe('StaticValue')
        expect(data.value).toBe('/literal.png')
    })

    it('标记二维码编辑 → expression 置 null，encode 回两键', () => {
        const editor = makeEditor(docWith([qrLayer({ value: '{{row.code}}', expression: '{{row.code}}' })]))

        editor.updateData(['layers', 0], 'https://example.com')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'QrCodeLayer' && layer.value).toBe('https://example.com')
        expect(layer.type === 'QrCodeLayer' && layer.expression).toBeNull()

        const data = encodeLayer(layer).data as Record<string, unknown>
        expect(Object.keys(data)).toEqual(['valueType', 'value'])
        expect(data.valueType).toBe('StaticValue')
        expect(data.value).toBe('https://example.com')
    })

    it('未标记层 updateData 后保持 expression = null（零变化面不回归）', () => {
        const editor = makeEditor(docWith([textLayer()]))
        editor.updateData(['layers', 0], '普通编辑')
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })

    it('无数据字段的层（表/行/格）空转', () => {
        const table = tableLayer([rowLayer([cellLayer(null)])])
        const editor = makeEditor(docWith([table]))
        editor.updateData(['layers', 0], 'x')
        expect(editor.store.history).toHaveLength(0)
    })

    it('mergeKey 合并语义与 updateSpec 一致', () => {
        const editor = makeEditor(textDoc())
        const mk = 'sel:layers.0:text'
        editor.updateData(['layers', 0], '中', { mergeKey: mk })
        editor.updateData(['layers', 0], '中文', { mergeKey: mk })
        expect(editor.store.history).toHaveLength(1)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('中文')
    })
})

describe('updateCanvasProp：画布级字段写入（未选中目标时的面板写入口）', () => {
    it('写 width/height 生效', () => {
        const editor = makeEditor(textDoc())
        editor.updateCanvasProp('width', 1024)
        editor.updateCanvasProp('height', 768)
        expect(editor.store.doc!.width).toBe(1024)
        expect(editor.store.doc!.height).toBe(768)
    })

    it('mergeKey 合并语义一致', () => {
        const editor = makeEditor(textDoc())
        editor.updateCanvasProp('width', 100, { mergeKey: 'canvas:width' })
        editor.updateCanvasProp('width', 200, { mergeKey: 'canvas:width' })
        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.doc!.width).toBe(200)
    })

    it('值不变时空转', () => {
        const editor = makeEditor(textDoc())
        editor.updateCanvasProp('width', 800)
        expect(editor.store.history).toHaveLength(0)
    })
})
