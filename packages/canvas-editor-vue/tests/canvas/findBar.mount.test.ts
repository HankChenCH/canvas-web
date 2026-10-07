// @vitest-environment jsdom
/**
 * FindBar 组件集成测试（canvas-web-find-replace 工单 03，spec 决策 5）：
 * - 开合：默认不渲染；⌘F 分派端到端（executeShortcut('findReplace') → 内核
 *   beginFind → 会话态 → 面板）即开且聚焦查询框；Esc 关闭（closeFind）即摘；
 *   关开往返查询词保留（内核会话态语义的面板呈现）；
 * - 输入即扫：查询词/替换词直写内核（无本地副本），计数「第 x/N 处」随派生
 *   matches 与游标联动；未命中「无结果」；可用态按命中数与游标裁剪；
 * - 四按钮分发：上一处/下一处 = setFindCursor + setSelection + panToBox（导航
 *   序 = 视觉序，spec 决策 6）；替换 = replaceOne 后跟随新当前命中；全部替换 =
 *   replaceAll + 「已替换 N 处」瞬时反馈；
 * - Enter=下一处 / Shift+Enter=上一处（两输入一致）；
 * - 重复 ⌘F 重新聚焦查询框——仅当焦点不在输入框（editableTarget 让路口径）；
 * - 文本编辑态 ⌘F 让路（桥分类器既有规则端到端）；
 * - 浮层不透传：pointerdown 冒泡被拦（点查找条不触发画布点选/平移）。
 */
import { describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import { EditorSession, type FrameScheduler } from '@hankchen/canvas-editor'

import FindBar from '../../src/canvas/FindBar.vue'
import { useShortcuts } from '../../src/shared/useShortcuts'
import { textLayer } from '../../../canvas-editor/tests/support/fixtures'

const nullScheduler: FrameScheduler = () => () => {}

/** 双层夹具：视觉序 = 数组尾→头，查询「春季」命中 [layer1, layer0] */
function makeEditor(): EditorSession {
    const editor = new EditorSession({ scheduleFrame: nullScheduler })
    editor.openDocument({
        width: 800,
        height: 600,
        layers: [
            textLayer({ text: '2026 春季', position: { x: 100 } }),
            textLayer({ text: '春季班', position: { x: 300 } }),
        ],
    })
    return editor
}

const mountBar = (editor: EditorSession) => mount(FindBar, { props: { editor }, attachTo: document.body })

const press = (init: KeyboardEventInit, target: EventTarget = window): boolean => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    return !target.dispatchEvent(event)
}

describe('FindBar：开合', () => {
    it('默认不渲染；⌘F 分派端到端（executeShortcut → beginFind）即开且聚焦查询框', async () => {
        const editor = makeEditor()
        const wrapper = mountBar(editor)
        expect(wrapper.find('[data-find-bar]').exists()).toBe(false)

        expect(editor.executeShortcut('findReplace')).toBe(true)
        await nextTick()
        expect(wrapper.find('[data-find-bar]').exists()).toBe(true)
        expect(document.activeElement).toBe(wrapper.find('[data-find-query]').element)
        wrapper.unmount()
    })

    it('Esc（输入框内）关闭：closeFind 调用、面板即摘', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const spy = vi.spyOn(editor, 'closeFind')
        const wrapper = mountBar(editor)
        await nextTick()
        await wrapper.find('[data-find-query]').trigger('keydown', { key: 'Escape' })
        expect(spy).toHaveBeenCalledTimes(1)
        expect(wrapper.find('[data-find-bar]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('关开往返：查询词保留（closeFind → beginFind 同文档连续改字）', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()
        await wrapper.find('[data-find-query]').setValue('春季')
        await wrapper.find('[data-find-query]').trigger('keydown', { key: 'Escape' })
        expect(wrapper.find('[data-find-bar]').exists()).toBe(false)

        editor.beginFind()
        await nextTick()
        const query = wrapper.find('[data-find-query]')
        expect(query.exists()).toBe(true)
        expect((query.element as HTMLInputElement).value).toBe('春季')
        wrapper.unmount()
    })
})

describe('FindBar：输入即扫与计数', () => {
    it('查询词直写内核（无本地副本），计数「第 x/N 处」随派生 matches 联动（视觉序）', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()

        await wrapper.find('[data-find-query]').setValue('春季')
        expect(editor.store.ui.find.query).toBe('春季')
        // 视觉序首命中 = 数组尾层（春季班）
        expect(wrapper.find('[data-find-count]').text()).toBe('第 1/2 处')
        wrapper.unmount()
    })

    it('未命中「无结果」；空 query 计数留空', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()

        await wrapper.find('[data-find-query]').setValue('不存在')
        expect(wrapper.find('[data-find-count]').text()).toBe('无结果')
        await wrapper.find('[data-find-query]').setValue('')
        expect(wrapper.find('[data-find-count]').text()).toBe('')
        wrapper.unmount()
    })

    it('替换词直写内核', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()
        await wrapper.find('[data-find-replace]').setValue('秋季')
        expect(editor.store.ui.find.replacement).toBe('秋季')
        wrapper.unmount()
    })
})

describe('FindBar：四按钮分发与可用态', () => {
    it('无命中：四按钮全部禁用', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()
        for (const hook of ['prev', 'next', 'replace-one', 'replace-all']) {
            expect(wrapper.find(`[data-find-${hook}]`).attributes('disabled')).toBeDefined()
        }
        wrapper.unmount()
    })

    it('下一处：游标 +1、选中命中层、panToBox 视口跟随；末处禁用下一处、首处禁用上一处', async () => {
        const editor = makeEditor()
        editor.beginFind()
        editor.setFindQuery('春季')
        const panSpy = vi.spyOn(editor, 'panToBox')
        const wrapper = mountBar(editor)
        await nextTick()

        expect(wrapper.find('[data-find-prev]').attributes('disabled')).toBeDefined()
        await wrapper.find('[data-find-next]').trigger('click')
        expect(editor.findCursor).toBe(1)
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        expect(panSpy).toHaveBeenCalledWith(editor.layerBoxAt(['layers', 0]))
        expect(wrapper.find('[data-find-next]').attributes('disabled')).toBeDefined()

        await wrapper.find('[data-find-prev]').trigger('click')
        expect(editor.findCursor).toBe(0)
        expect(editor.store.ui.selection).toEqual(['layers', 1])
        wrapper.unmount()
    })

    it('Enter=下一处 / Shift+Enter=上一处（查询输入）', async () => {
        const editor = makeEditor()
        editor.beginFind()
        editor.setFindQuery('春季')
        const wrapper = mountBar(editor)
        await nextTick()

        await wrapper.find('[data-find-query]').trigger('keydown', { key: 'Enter' })
        expect(editor.findCursor).toBe(1)
        await wrapper.find('[data-find-query]').trigger('keydown', { key: 'Enter', shiftKey: true })
        expect(editor.findCursor).toBe(0)
        wrapper.unmount()
    })

    it('替换：replaceOne 分发，成功后跟随新当前命中（内核游标原地指向下一处）', async () => {
        const editor = makeEditor()
        editor.beginFind()
        editor.setFindQuery('春季')
        const replaceSpy = vi.spyOn(editor, 'replaceOne')
        const wrapper = mountBar(editor)
        await nextTick()

        await wrapper.find('[data-find-replace-one]').trigger('click')
        expect(replaceSpy).toHaveBeenCalledTimes(1)
        // 视觉序首命中（春季班）被替换 → 派生列表缩一位，原下标即下一处
        // （2026 春季 上的命中），选中跟随
        expect(editor.store.ui.selection).toEqual(['layers', 0])
        wrapper.unmount()
    })

    it('替换真实接线：写值经内核落盘、命中列表随 doc 变更收缩、计数联动', async () => {
        const editor = makeEditor()
        editor.beginFind()
        editor.setFindQuery('春季')
        editor.setFindReplacement('秋季')
        const wrapper = mountBar(editor)
        await nextTick()

        await wrapper.find('[data-find-replace-one]').trigger('click')
        // 视觉序首命中 = 数组尾层（春季班）；前层暂未被替换
        expect((editor.store.doc!.layers[1] as { text: string }).text).toBe('秋季班')
        expect((editor.store.doc!.layers[0] as { text: string }).text).toBe('2026 春季')
        expect(wrapper.find('[data-find-count]').text()).toBe('第 1/1 处')
        wrapper.unmount()
    })

    it('全部替换：replaceAll 一步落盘 + 「已替换 N 处」反馈；命中清空后四按钮禁用', async () => {
        const editor = makeEditor()
        editor.beginFind()
        editor.setFindQuery('春季')
        editor.setFindReplacement('秋季')
        const wrapper = mountBar(editor)
        await nextTick()

        await wrapper.find('[data-find-replace-all]').trigger('click')
        expect(editor.store.doc!.layers.map((l) => (l as { text: string }).text)).toEqual(['2026 秋季', '秋季班'])
        expect(wrapper.find('[data-find-note]').text()).toBe('已替换 2 处')
        expect(wrapper.find('[data-find-count]').text()).toBe('无结果')
        for (const hook of ['prev', 'next', 'replace-one', 'replace-all']) {
            expect(wrapper.find(`[data-find-${hook}]`).attributes('disabled')).toBeDefined()
        }
        wrapper.unmount()
    })

    it('查询词变更清「已替换 N 处」瞬时反馈', async () => {
        const editor = makeEditor()
        editor.beginFind()
        editor.setFindQuery('春季')
        editor.setFindReplacement('秋季')
        const wrapper = mountBar(editor)
        await nextTick()
        await wrapper.find('[data-find-replace-all]').trigger('click')
        expect(wrapper.find('[data-find-note]').exists()).toBe(true)

        await wrapper.find('[data-find-query]').setValue('秋季')
        expect(wrapper.find('[data-find-note]').exists()).toBe(false)
        wrapper.unmount()
    })
})

describe('FindBar：重复 ⌘F 重新聚焦（spec 决策 5）', () => {
    it('焦点不在输入框时：⌘F 重新聚焦查询框', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()
        ;(document.activeElement as HTMLElement).blur()

        press({ key: 'f', metaKey: true })
        expect(document.activeElement).toBe(wrapper.find('[data-find-query]').element)
        wrapper.unmount()
    })

    it('大写锁定（key=F）同款聚焦：键名小写归一（与内核分类器同口径）', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()
        ;(document.activeElement as HTMLElement).blur()

        press({ key: 'F', metaKey: true })
        expect(document.activeElement).toBe(wrapper.find('[data-find-query]').element)
        wrapper.unmount()
    })

    it('焦点在替换输入框时：⌘F 让路不抢焦点（editableTarget 既有规则）', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()
        const replaceInput = wrapper.find('[data-find-replace]').element as HTMLInputElement
        replaceInput.focus()
        expect(document.activeElement).toBe(replaceInput)

        // 事件 target = 聚焦的输入框（真机 keydown 即派发在焦点元素上）
        press({ key: 'f', metaKey: true }, replaceInput)
        expect(document.activeElement).toBe(replaceInput)
        wrapper.unmount()
    })
})

describe('FindBar：编辑态让路与浮层隔离', () => {
    it('文本编辑态 ⌘F 让路（桥分类器既有规则端到端）：面板不开；提交后 ⌘F 可开', async () => {
        const editor = makeEditor()
        const scope = effectScope()
        scope.run(() => useShortcuts(editor))
        const wrapper = mountBar(editor)

        expect(editor.beginTextEdit(['layers', 0])).toBe(true)
        expect(press({ key: 'f', metaKey: true })).toBe(false) // 让路：不拦默认、不分派
        await nextTick()
        expect(wrapper.find('[data-find-bar]').exists()).toBe(false)

        editor.commitTextEdit('改完')
        expect(press({ key: 'f', metaKey: true })).toBe(true) // 非编辑态照常分派
        await nextTick()
        expect(wrapper.find('[data-find-bar]').exists()).toBe(true)
        wrapper.unmount()
        scope.stop()
    })

    it('浮层不透传：查找条根 pointerdown 不冒泡（画布点选/平移不触发）', async () => {
        const editor = makeEditor()
        editor.beginFind()
        const wrapper = mountBar(editor)
        await nextTick()

        const bubbled = vi.fn()
        document.body.addEventListener('pointerdown', bubbled)
        await wrapper.find('[data-find-bar]').trigger('pointerdown')
        expect(bubbled).not.toHaveBeenCalled()
        document.body.removeEventListener('pointerdown', bubbled)
        wrapper.unmount()
    })
})
