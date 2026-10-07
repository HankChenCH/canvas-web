import { describe, expect, it, vi } from 'vitest'

import { decodeLayer, encodeLayer, type Canvas } from '@hankchen/canvas'

import { EditorSession, type FrameScheduler } from '../../src/session/editor'
import { cellLayer, imageLayer, qrLayer, rowLayer, tableLayer, textLayer } from '../support/fixtures'

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

describe('updateDataExpression：打标（expression 非 null，值字段恒镜像原文）', () => {
    it('TextLayer：text := expression 原文，encode 回 ExpressionValue 三键', () => {
        const editor = makeEditor(docWith([textLayer({ text: '字面文案' })]))

        editor.updateDataExpression(['layers', 0], '{{personProfile.name}}')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{personProfile.name}}')
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{personProfile.name}}')

        const data = encodeLayer(layer).data as Record<string, unknown>
        expect(data.valueType).toBe('ExpressionValue')
        expect(data.expression).toBe('{{personProfile.name}}')
        expect(data.value).toBe('{{personProfile.name}}')
    })

    it('ImageLayer：src := expression 原文（标记态空串不归一）', () => {
        const editor = makeEditor(docWith([imageLayer({ src: '/a.png' })]))

        editor.updateDataExpression(['layers', 0], '{{sealPath}}')
        let layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.src).toBe('{{sealPath}}')
        expect(layer.type === 'ImageLayer' && layer.expression).toBe('{{sealPath}}')

        // 标记态空串保留标记（镜像 decodeImageLayer 标记分支：'' 不做 →null 归一）
        editor.updateDataExpression(['layers', 0], '')
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.src).toBe('')
        expect(layer.type === 'ImageLayer' && layer.expression).toBe('')
    })

    it('QrCodeLayer：value := expression 原文', () => {
        const editor = makeEditor(docWith([qrLayer({ value: 'https://example.com' })]))

        editor.updateDataExpression(['layers', 0], '{{qrcodeContent}}')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'QrCodeLayer' && layer.value).toBe('{{qrcodeContent}}')
        expect(layer.type === 'QrCodeLayer' && layer.expression).toBe('{{qrcodeContent}}')
    })

    it('已标记层重打标：原文整体替换', () => {
        const editor = makeEditor(docWith([textLayer({ text: '{{a}}', expression: '{{a}}' })]))

        editor.updateDataExpression(['layers', 0], '{{b}}')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('{{b}}')
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{b}}')
    })
})

describe('updateDataExpression：解标（expression = null，值字段保持现值退字面）', () => {
    it('TextLayer：字面接管，encode 回 StaticValue 三键 expression:\'\'', () => {
        const expression = '订单 {{orderNo}}'
        const editor = makeEditor(docWith([textLayer({ text: expression, expression })]))

        editor.updateDataExpression(['layers', 0], null)

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe(expression)
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()

        const data = encodeLayer(layer).data as Record<string, unknown>
        expect(data.valueType).toBe('StaticValue')
        expect(Object.keys(data)).toEqual(['valueType', 'expression', 'value'])
        expect(data.expression).toBe('')
        expect(data.value).toBe(expression)
    })

    it('ImageLayer：字面接管，非空原文保留；解标后空串/null 归 null', () => {
        const editor = makeEditor(docWith([imageLayer({ src: '{{sealPath}}', expression: '{{sealPath}}' })]))

        editor.updateDataExpression(['layers', 0], null)
        let layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.src).toBe('{{sealPath}}')
        expect(layer.type === 'ImageLayer' && layer.expression).toBeNull()

        // 解标后再走字面写空 → null（updateData 既有语义）
        editor.updateData(['layers', 0], '')
        layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'ImageLayer' && layer.src).toBeNull()
    })

    it('encode 往返恒等：打标 → encode → decode 回同一领域形态', () => {
        const editor = makeEditor(docWith([textLayer({ text: '字面' })]))

        editor.updateDataExpression(['layers', 0], '{{row.seqno}}. {{row.name}}')
        const layer = editor.store.doc!.layers[0]!
        const decoded = decodeLayer(encodeLayer(layer))

        expect(decoded).toEqual(layer)
    })
})

describe('updateDataExpression：空转与历史', () => {
    it('无数据字段的层（表/行/格）与越界路径空转', () => {
        const table = tableLayer([rowLayer([cellLayer(null)])])
        const editor = makeEditor(docWith([table]))
        const listener = vi.fn()
        editor.subscribe(listener)

        editor.updateDataExpression(['layers', 0], '{{x}}')
        editor.updateDataExpression(['layers', 0, 'rows', 0], '{{x}}')
        editor.updateDataExpression(['layers', 9], '{{x}}')

        expect(editor.store.history).toHaveLength(0)
        expect(listener).not.toHaveBeenCalled()
    })

    it('一步历史可撤销；打标→撤销恢复字面', () => {
        const editor = makeEditor(docWith([textLayer({ text: '字面文案' })]))

        editor.updateDataExpression(['layers', 0], '{{certCode}}')
        expect(editor.store.history).toHaveLength(1)

        editor.undo()
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('字面文案')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })

    it('mergeKey 合步：连续表达式编辑并入一步，closeMerge 后另起一步', () => {
        const editor = makeEditor(docWith([textLayer()]))
        const mk = 'sel:layers.0:data.expression'

        editor.updateDataExpression(['layers', 0], '{{a}}', { mergeKey: mk })
        editor.updateDataExpression(['layers', 0], '{{a}}{{b}}', { mergeKey: mk })
        expect(editor.store.history).toHaveLength(1)

        editor.store.closeMerge(mk)
        editor.updateDataExpression(['layers', 0], '{{c}}', { mergeKey: mk })
        expect(editor.store.history).toHaveLength(2)
        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.expression).toBe('{{c}}')
    })

    it('与 updateData 组合：打标后字面编辑退化静态（工票 02 语义不回归）', () => {
        const editor = makeEditor(docWith([textLayer({ text: '字面' })]))

        editor.updateDataExpression(['layers', 0], '{{certCode}}')
        editor.updateData(['layers', 0], '改成字面')

        const layer = editor.store.doc!.layers[0]!
        expect(layer.type === 'TextLayer' && layer.text).toBe('改成字面')
        expect(layer.type === 'TextLayer' && layer.expression).toBeNull()
    })

    it('格内容层路径：打标/解标正常', () => {
        const table = tableLayer([rowLayer([cellLayer(textLayer())])])
        const editor = makeEditor(docWith([table]))

        editor.updateDataExpression(['layers', 0, 'rows', 0, 'cells', 0, 'content'], '{{row.name}}')
        const content = editor.store.doc!.layers[0]!
        expect(
            content.type === 'TableLayer' &&
                content.rows[0]!.cells[0]!.content?.type === 'TextLayer' &&
                content.rows[0]!.cells[0]!.content.expression,
        ).toBe('{{row.name}}')

        editor.updateDataExpression(['layers', 0, 'rows', 0, 'cells', 0, 'content'], null)
        const after = editor.store.doc!.layers[0]!
        expect(
            after.type === 'TableLayer' && after.rows[0]!.cells[0]!.content?.type === 'TextLayer'
                ? after.rows[0]!.cells[0]!.content.expression
                : undefined,
        ).toBeNull()
    })
})
