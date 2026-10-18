// @vitest-environment jsdom
/**
 * 属性面板会话内容独占挂载测试（canvas-web-edit-overlay-toolbar 工单 02，ADR 0019）：
 * - 门面锁定：编辑会话期（选中层即编辑层）内容字段与模式段 disabled + 编辑中提示；
 * - 显示随动：锁定的模式段显示随会话活标志（画布 pill/内核 toggleDataMode 翻转
 *   实时翻转），内容字段显示文档现值（live 键入不落文档 = 进入时文本）；
 * - 退出追平：提交后字段解锁并显示提交后文档值（随 doc 通知追平）；
 * - 锁定面只命中编辑层：会话保持时选中其他层，面板照常可编辑。
 */
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

import { EditorSession, type Canvas, type FrameScheduler } from '@hankchen/canvas-editor'

import { textLayer } from '../../../canvas-editor/tests/support/fixtures'
import TextEditingOverlay from '../../src/canvas/TextEditingOverlay.vue'
import PropertyPanel from '../../src/property-panel/PropertyPanel.vue'

// jsdom 不实现 matchMedia：补最小桩（本文件要真挂 TextEditingOverlay 走 pill 路径）
if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
    })) as unknown as typeof window.matchMedia
}

const nullScheduler: FrameScheduler = () => () => {}

function makeEditor(layers: Canvas['layers']): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({ width: 800, height: 600, background: null, layers })
    return editor
}

function mountPanel(editor: EditorSession): VueWrapper {
    return mount(PropertyPanel, { props: { editor } })
}

const contentTextarea = (wrapper: VueWrapper) => wrapper.find('textarea')
const modeSegment = (wrapper: VueWrapper) => wrapper.find('[role="group"][aria-label="取值方式"]')
const modeButton = (wrapper: VueWrapper, kind: 'static' | 'expression') =>
    wrapper.find(`[data-mode-${kind}]`)

describe('会话内容独占：面板内容字段与模式段锁定（门面）', () => {
    it('进入编辑：内容字段 disabled 且显示进入时文档值，模式段 disabled', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountPanel(editor)

        expect(editor.beginTextEdit(['layers', 0])).toBe(true)
        await nextTick()

        expect(contentTextarea(wrapper).attributes('disabled')).toBeDefined()
        expect((contentTextarea(wrapper).element as HTMLTextAreaElement).value).toBe('你好画布')
        expect(modeSegment(wrapper).attributes('aria-disabled')).toBe('true')
        expect(modeButton(wrapper, 'static').attributes('aria-pressed')).toBe('true')
    })

    it('锁定段显示随会话活标志：pill/内核路由翻转后面板段同步翻转且仍锁定', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountPanel(editor)
        editor.beginTextEdit(['layers', 0])
        await nextTick()

        editor.toggleDataMode(['layers', 0]) // 画布 pill/内核路由同款：只翻标志
        await nextTick()

        expect(modeButton(wrapper, 'expression').attributes('aria-pressed')).toBe('true')
        expect(modeButton(wrapper, 'static').attributes('aria-pressed')).toBe('false')
        expect(modeSegment(wrapper).attributes('aria-disabled')).toBe('true')
        // 零文档变更：内容字段读数不动
        expect((contentTextarea(wrapper).element as HTMLTextAreaElement).value).toBe('你好画布')
    })

    it('旁门内容写落文档：锁定字段读数随文档追平（显示不撒谎）', async () => {
        const editor = makeEditor([textLayer({ priority: 10, text: '证书姓名' })])
        editor.setSelection(['layers', 0])
        const wrapper = mountPanel(editor)
        editor.beginTextEdit(['layers', 0])
        await nextTick()

        editor.setFindQuery('证书')
        editor.setFindReplacement('奖状')
        editor.replaceAll()
        await nextTick()

        expect((contentTextarea(wrapper).element as HTMLTextAreaElement).value).toBe('奖状姓名')
    })

    it('退出提交追平：字段解锁、读数 = 提交后文档值', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountPanel(editor)
        editor.beginTextEdit(['layers', 0])
        await nextTick()

        expect(editor.commitTextEdit('退出后的文案')).toBe(true)
        await nextTick()

        expect(contentTextarea(wrapper).attributes('disabled')).toBeUndefined()
        expect((contentTextarea(wrapper).element as HTMLTextAreaElement).value).toBe('退出后的文案')
        expect(modeSegment(wrapper).attributes('aria-disabled')).toBeUndefined()
    })

    it('锁定面只命中编辑层：会话保持时选中其他层，面板照常可编辑', async () => {
        const editor = makeEditor([textLayer({ priority: 10 }), textLayer({ priority: 5, text: '乙层' })])
        editor.setSelection(['layers', 0])
        const wrapper = mountPanel(editor)
        editor.beginTextEdit(['layers', 0])
        await nextTick()

        editor.setSelection(['layers', 1])
        await nextTick()

        expect(contentTextarea(wrapper).attributes('disabled')).toBeUndefined()
        expect((contentTextarea(wrapper).element as HTMLTextAreaElement).value).toBe('乙层')
        expect(modeSegment(wrapper).attributes('aria-disabled')).toBeUndefined()
    })

    it('编辑中提示行在场：锁定期内容字段下方给「在画布编辑框内修改」提示', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountPanel(editor)
        editor.beginTextEdit(['layers', 0])
        await nextTick()

        const hints = wrapper.findAll('.cn-prop-field__hint').map((hint) => hint.text())
        expect(hints.some((text) => text.includes('编辑框'))).toBe(true)
    })

    it('真工具条段路径端到端：画布内容类型段切换 → 锁定的面板段显示同步翻转（验收条 2 挂载 seam）', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        // overlay（画布侧内容类型段）与 panel 同 editor 装配：走完整链路
        // EditOverlayToolbar → setExpressionMode → 会话标志 → 面板锁定段
        const hostEl = document.createElement('div')
        document.body.appendChild(hostEl)
        const overlay = mount(TextEditingOverlay, { props: { editor }, attachTo: hostEl })
        const wrapper = mountPanel(editor)
        expect(editor.beginTextEdit(['layers', 0])).toBe(true)
        await nextTick()

        expect(modeButton(wrapper, 'static').attributes('aria-pressed')).toBe('true')
        await overlay.find('[data-pill-expression]').trigger('click')
        await nextTick()

        expect(modeButton(wrapper, 'expression').attributes('aria-pressed')).toBe('true')
        expect(modeButton(wrapper, 'static').attributes('aria-pressed')).toBe('false')
        expect(modeSegment(wrapper).attributes('aria-disabled')).toBe('true')
        expect(editor.store.history).toHaveLength(0) // pill 切换零文档变更零历史

        overlay.unmount()
        wrapper.unmount()
        hostEl.remove()
    })

    it('非编辑态不锁定（回归）', async () => {
        const editor = makeEditor([textLayer({ priority: 10 })])
        editor.setSelection(['layers', 0])
        const wrapper = mountPanel(editor)
        await nextTick()

        expect(contentTextarea(wrapper).attributes('disabled')).toBeUndefined()
        expect(modeSegment(wrapper).attributes('aria-disabled')).toBeUndefined()
    })
})
