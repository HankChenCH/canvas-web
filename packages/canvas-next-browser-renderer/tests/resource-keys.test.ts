import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { fontResourceKey, imageResourceKey, qrResourceKey } from '../src/materializer'

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
