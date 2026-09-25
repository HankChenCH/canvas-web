import { describe, expect, it, vi } from 'vitest'
import { computed, effectScope, type ComputedRef } from 'vue'

import { EditorSession, resolveLayer, type Canvas, type FrameScheduler } from '@hankchen/canvas-next-editor'

import { CANVAS_FIELD_SECTIONS } from '../src/fieldSchema'
import { usePropertyPanel, type FieldDef } from '../src/usePropertyPanel'

/** 同步手动调度器：测试里不真正驱动重绘，只让会话可构造 */
const nullScheduler: FrameScheduler = () => () => {}

const textLayer = (overrides: Record<string, unknown> = {}): Canvas['layers'][number] => ({
    type: 'TextLayer',
    priority: 10,
    shape: {
        width: 100,
        height: 50,
        autoWidth: false,
        autoHeight: false,
        lineHeight: 1.2,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        border: { top: null, bottom: null, left: null, right: null },
        backgroundColor: null,
    },
    align: { horizontal: 'left', vertical: 'top' },
    position: { anchor: 'top-left', x: 0, y: 0 },
    text: '甲',
    font: '',
    fontSize: 16,
    fontColor: '#000000',
    angle: 0,
    autowrap: false,
    ...overrides,
})

function makeEditor(layers: Canvas['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, layers })
    return editor
}

function bind(editor: EditorSession) {
    const scope = effectScope()
    let panel: ReturnType<typeof usePropertyPanel> | null = null
    scope.run(() => {
        panel = usePropertyPanel(editor)
    })
    return { scope, panel: panel! }
}

const X_FIELD: FieldDef = { key: ['position', 'x'], label: 'X', control: 'number', integer: true }
const TEXT_FIELD: FieldDef = { key: ['text'], label: '内容', control: 'textarea', data: true }

describe('usePropertyPanel（面板订阅为 computed 切片）', () => {
    it('未打开文档：目标为空、字段组为空', () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        const { scope, panel } = bind(editor)
        expect(panel.canvas.value).toBeNull()
        expect(panel.layer.value).toBeNull()
        expect(panel.sections.value).toEqual([])
        scope.stop()
    })

    it('未选中图层：画布级目标（宽/高字段组），layer 为 null', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        expect(panel.selection.value).toBeNull()
        expect(panel.layer.value).toBeNull()
        expect(panel.sections.value).toEqual(CANVAS_FIELD_SECTIONS)
        expect(panel.canvas.value!.width).toBe(800)
        scope.stop()
    })

    it('选中图层：layer 即路径处领域对象（引用等），字段组按 type/角色过滤', () => {
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 1])
        expect(panel.selection.value).toEqual(['layers', 1])
        expect(panel.layer.value).toBe(resolveLayer(editor.store.doc!, ['layers', 1]))
        const keys = panel.sections.value.flatMap((s) => s.fields.map((f) => f.key.join('.')))
        expect(keys).toContain('text')
        expect(keys).not.toContain('src')
        scope.stop()
    })

    it('无关图层变更：layer 切片引用不变，下游 computed 不重算（结构共享短路）', () => {
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])
        const before = panel.layer.value

        let derivedRuns = 0
        let derived: ComputedRef<number> | null = null
        const scope2 = effectScope()
        scope2.run(() => {
            derived = computed(() => {
                derivedRuns += 1
                return panel!.sections.value.length
            })
        })
        expect(derived!.value).toBeGreaterThan(0)
        const runsAfterSetup = derivedRuns

        editor.store.transact((draft) => {
            const target = draft.layers[1]!
            if (target.type === 'TextLayer') target.text = '改动无关层'
        })
        expect(panel.layer.value).toBe(before) // 切片引用保持
        expect(derivedRuns).toBe(runsAfterSetup) // 下游不重算
        scope2.stop()
        scope.stop()
    })

    it('选中层自身变更：切片引用更新，字段读数联动', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])
        const before = panel.layer.value
        editor.updateSpec(['layers', 0], ['position', 'x'], 55)
        const after = panel.layer.value
        expect(after).not.toBe(before)
        expect(after!.position.x).toBe(55)
        scope.stop()
    })
})

describe('commit：面板唯一提交口（分派 updateSpec/updateData/updateCanvasProp）', () => {
    it('spec 字段：写入选中层，final 提交为一步历史', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(X_FIELD, 42, true)

        expect(editor.store.doc!.layers[0]!.position.x).toBe(42)
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('连续 live 提交按字段 mergeKey 合并为一步，final 收口后另起新步', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(X_FIELD, 10, false)
        panel.commit(X_FIELD, 20, false)
        expect(editor.store.history).toHaveLength(1)
        panel.commit(X_FIELD, 30, true) // final：值再变 → 收口
        expect(editor.store.history).toHaveLength(1)

        panel.commit(X_FIELD, 40, false) // 收口后的新会话 → 新步
        expect(editor.store.history).toHaveLength(2)
        expect(editor.store.doc!.layers[0]!.position.x).toBe(40)
        scope.stop()
    })

    it('data 字段走 updateData 分派（TextLayer → text）', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])

        panel.commit(TEXT_FIELD, '新文案', true)

        expect(editor.store.doc!.layers[0]!.type === 'TextLayer' && editor.store.doc!.layers[0]!.text).toBe('新文案')
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('未选中时提交画布级字段（宽/高），live 合步', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        const widthField: FieldDef = { key: ['width'], label: '宽', control: 'number', integer: true }

        panel.commit(widthField, 100, false)
        panel.commit(widthField, 200, false)
        panel.commit(widthField, 300, true)

        expect(editor.store.doc!.width).toBe(300)
        expect(editor.store.history).toHaveLength(1)
        scope.stop()
    })

    it('画布级字段只认 width/height（防御未知键）', () => {
        const editor = makeEditor([textLayer()])
        const { scope, panel } = bind(editor)
        panel.commit({ key: ['bogus'], label: '?', control: 'number' }, 1, true)
        expect(editor.store.history).toHaveLength(0)
        scope.stop()
    })

    it('无文档时 commit 空转', () => {
        const editor = new EditorSession({ scheduleFrame: nullScheduler })
        const { scope, panel } = bind(editor)
        expect(() => panel.commit(X_FIELD, 1, true)).not.toThrow()
        scope.stop()
    })
})

describe('选择切换闭合未收口事务', () => {
    it('live 提交后切换选择：开放 mergeKey 自动闭合（卸载丢焦不遗留开放步）', () => {
        const editor = makeEditor([textLayer(), textLayer({ text: '乙' })])
        const { scope, panel } = bind(editor)
        editor.setSelection(['layers', 0])
        panel.commit(X_FIELD, 12, false)
        expect(editor.store.history[0]!.mergeKey).not.toBeNull()

        editor.setSelection(['layers', 1])

        expect(editor.store.history).toHaveLength(1)
        expect(editor.store.history[0]!.mergeKey).toBeNull()
        scope.stop()
    })
})

describe('订阅清理', () => {
    it('scope 停止后经 onScopeDispose 注销订阅，退订幂等', () => {
        const editor = makeEditor([])
        const subscribeSpy = vi.spyOn(editor, 'subscribe')
        const scope = effectScope()
        scope.run(() => {
            usePropertyPanel(editor)
        })
        const unsubscribe = subscribeSpy.mock.results[0]!.value
        scope.stop()
        expect(() => unsubscribe()).not.toThrow()
    })
})
