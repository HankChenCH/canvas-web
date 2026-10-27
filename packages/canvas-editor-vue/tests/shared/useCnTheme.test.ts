// @vitest-environment jsdom
/**
 * useCnTheme 单测（editor-theme-light-dark 工票 04，spec §5/§8）。
 *
 * 语义：模块级单例 ref（日间 light / 夜间 dark，缺省夜间）+ set/toggle；写出即
 * 同步 data-cn-theme 到目标元素（缺省 documentElement，target 注入可覆盖），
 * 夜间也显式写（信号可见——spec §8「缺席即日间」的纯 CSS 不可两全由显式信号
 * 兜底）；storageKey 传入才读写 localStorage（调用时初始化读、set 时写），缺省
 * 不持久化；document 访问全部延迟到函数体内，模块导入零 DOM 触碰。
 * 不监听 prefers-color-scheme、无切换动画（Q4，明确不做，不设测试）。
 *
 * 单例语义要求每次用例拿到全新模块实例：一律 vi.resetModules() + 动态导入。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

/** 动态导入被测模块（配合 vi.resetModules 保证单例按用例隔离） */
const importUseCnTheme = () => import('../../src/shared/useCnTheme')

afterEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.removeAttribute('data-cn-theme')
})

describe('useCnTheme（编辑器日间/夜间主题状态）', () => {
    it('单例同一性：多处调用共享同一状态', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const a = useCnTheme()
        const b = useCnTheme()
        expect(a.theme).toBe(b.theme)
        a.set('light')
        expect(b.theme.value).toBe('light')
        b.set('dark')
        expect(a.theme.value).toBe('dark')
    })

    it('缺省夜间：初始值 dark', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const { theme } = useCnTheme()
        expect(theme.value).toBe('dark')
    })

    it('set 即时写 data-cn-theme 到默认 target（documentElement）', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const { set } = useCnTheme()
        set('light')
        expect(document.documentElement.getAttribute('data-cn-theme')).toBe('light')
    })

    it('初始化即同步信号：调用即写当前值（夜间也显式写）', async () => {
        const { useCnTheme } = await importUseCnTheme()
        useCnTheme()
        expect(document.documentElement.getAttribute('data-cn-theme')).toBe('dark')
    })

    it('夜间也显式写信号（不依赖属性缺席语义）', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const { set } = useCnTheme()
        set('light')
        set('dark')
        expect(document.documentElement.getAttribute('data-cn-theme')).toBe('dark')
    })

    it('toggle 在日间/夜间间往返并同步信号', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const { theme, toggle } = useCnTheme()
        expect(theme.value).toBe('dark')
        toggle()
        expect(theme.value).toBe('light')
        expect(document.documentElement.getAttribute('data-cn-theme')).toBe('light')
        toggle()
        expect(theme.value).toBe('dark')
        expect(document.documentElement.getAttribute('data-cn-theme')).toBe('dark')
    })

    it('target 注入覆盖：信号写到注入元素，documentElement 不动', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const host = document.createElement('div')
        document.body.appendChild(host)
        const { set } = useCnTheme({ target: () => host })
        set('light')
        expect(host.getAttribute('data-cn-theme')).toBe('light')
        expect(document.documentElement.hasAttribute('data-cn-theme')).toBe(false)
    })

    it('target 返回 null 时跳过写入不抛错', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const { set } = useCnTheme({ target: () => null })
        expect(() => set('light')).not.toThrow()
        expect(document.documentElement.hasAttribute('data-cn-theme')).toBe(false)
    })

    it('storageKey 往返：set 写入 localStorage；重建后初始化读回并同步信号', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const { set } = useCnTheme({ storageKey: 'cn-theme.test' })
        set('light')
        expect(localStorage.getItem('cn-theme.test')).toBe('light')

        // 模拟宿主重新加载：全新模块实例，初始化时读回持久化值
        vi.resetModules()
        const { useCnTheme: reloaded } = await importUseCnTheme()
        const { theme } = reloaded({ storageKey: 'cn-theme.test' })
        expect(theme.value).toBe('light')
        expect(document.documentElement.getAttribute('data-cn-theme')).toBe('light')
    })

    it('storageKey 存值非法时忽略，落到缺省夜间', async () => {
        localStorage.setItem('cn-theme.test', 'sepia')
        const { useCnTheme } = await importUseCnTheme()
        const { theme } = useCnTheme({ storageKey: 'cn-theme.test' })
        expect(theme.value).toBe('dark')
    })

    it('缺省不持久化：set 不写 localStorage', async () => {
        const { useCnTheme } = await importUseCnTheme()
        const { set } = useCnTheme()
        set('light')
        expect(localStorage.length).toBe(0)
    })

    it('模块导入零 DOM 触碰：顶层不访问 document', async () => {
        vi.stubGlobal('document', {
            get documentElement(): HTMLElement {
                throw new Error('模块顶层触碰了 document')
            },
        })
        vi.resetModules()
        // 顶层一旦触碰 document，动态导入即抛错
        await expect(importUseCnTheme()).resolves.toBeDefined()
    })
})
