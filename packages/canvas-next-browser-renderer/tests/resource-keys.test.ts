import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { createMemoizedKeyHash, fontResourceKey, imageResourceKey, qrResourceKey } from '../src/materializer'

/** node:crypto 作独立 oracle：手写 sha256 的产物必须与标准实现逐字节一致 */
function sha256Oracle(input: string): string {
    return createHash('sha256').update(input, 'utf8').digest('hex')
}

describe('资源缓存键：sha256(完整引用)，不继承 PHP basename 旧债', () => {
    it('sha256 键与 node:crypto oracle 一致（含中文/emoji 引用）', () => {
        for (const ref of [
            'https://cdn.example.com/a.png',
            'https://cdn.example.com/组图-🎉.png?v=2#frag',
            '/local/relative.svg',
            'data:image/png;base64,AAAA',
            '',
        ]) {
            expect(imageResourceKey(ref)).toBe(sha256Oracle(ref))
            expect(imageResourceKey(ref)).toMatch(/^[0-9a-f]{64}$/)
        }
    })

    it('同名不同 URL 不碰撞（PHP basename 缓存的旧债，这里逐字节区分）', () => {
        const a = imageResourceKey('https://a.example.com/poster.png')
        const b = imageResourceKey('https://b.example.com/poster.png')
        expect(a).not.toBe(b)
        expect(a).toBe(sha256Oracle('https://a.example.com/poster.png'))
        expect(b).toBe(sha256Oracle('https://b.example.com/poster.png'))
    })

    it('字体键同口径：sha256(字体 URL) 完整引用', () => {
        expect(fontResourceKey('https://fonts.example.com/open.ttf')).toBe(
            sha256Oracle('https://fonts.example.com/open.ttf'),
        )
        expect(fontResourceKey('https://a.example.com/f.woff2')).not.toBe(
            fontResourceKey('https://b.example.com/f.woff2'),
        )
    })

    it('QR 键：内容加 qr: 命名空间后散列（与图片 URL 键域隔离）', () => {
        expect(qrResourceKey('https://example.com/join')).toBe(
            sha256Oracle('qr:https://example.com/join'),
        )
        // 内容即 URL 的 QR 与同串图片键不碰撞（qr: 前缀隔离）
        expect(qrResourceKey('https://example.com/a.png')).not.toBe(
            imageResourceKey('https://example.com/a.png'),
        )
    })
})

describe('键 memo（canvas-web-render-perf 工单 02）：同引用串不重复散列', () => {
    it('同输入只算一次、异输入各算各，产物与底层一致', () => {
        const underlying = vi.fn((input: string) => `k:${input}`)
        const memo = createMemoizedKeyHash(underlying)

        expect(memo('a')).toBe('k:a')
        expect(memo('a')).toBe('k:a') // 命中
        expect(memo('b')).toBe('k:b')
        expect(underlying).toHaveBeenCalledTimes(2)
    })

    it('容量界淘汰最旧，淘汰后重算、未逐出仍命中', () => {
        const underlying = vi.fn((input: string) => input.toUpperCase())
        const memo = createMemoizedKeyHash(underlying, 2)

        memo('a')
        memo('b')
        memo('c') // 逐出 'a'
        expect(underlying).toHaveBeenCalledTimes(3)

        memo('a') // 重算
        expect(underlying).toHaveBeenCalledTimes(4)
        memo('c') // 仍在
        expect(underlying).toHaveBeenCalledTimes(4)
    })

    it('三键函数接 memo 后行为不变（oracle 复核 + 大串引用同键）', () => {
        const big = `data:image/png;base64,${'A'.repeat(4096)}`
        expect(imageResourceKey(big)).toBe(sha256Oracle(big))
        expect(imageResourceKey(big)).toBe(imageResourceKey(big))
        expect(fontResourceKey('/fonts/open-sans.ttf')).toBe(sha256Oracle('/fonts/open-sans.ttf'))
        expect(qrResourceKey('join')).toBe(sha256Oracle('qr:join'))
    })
})
