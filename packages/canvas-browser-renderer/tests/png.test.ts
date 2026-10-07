import { describe, expect, it } from 'vitest'

import { PNG_SIGNATURE, crc32, insertPngTextChunk, parsePngChunks } from '../src/png'

/** 手工拼一个最小 PNG 字节流：签名 + IHDR + IDAT + IEND（数据为占位字节） */
function minimalPng(): Uint8Array {
    const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const chunk = (type: string, data: Uint8Array): Uint8Array => {
        const out = new Uint8Array(12 + data.length)
        const view = new DataView(out.buffer)
        view.setUint32(0, data.length)
        for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
        out.set(data, 8)
        view.setUint32(8 + data.length, crc32(new Uint8Array(out.subarray(4, 8 + data.length))))
        return out
    }
    const ihdr = chunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 0, 0, 0, 0]))
    const idat = chunk('IDAT', new Uint8Array([1, 2, 3, 4]))
    const iend = chunk('IEND', new Uint8Array())
    const out = new Uint8Array(signature.length + ihdr.length + idat.length + iend.length)
    out.set(signature, 0)
    out.set(ihdr, signature.length)
    out.set(idat, signature.length + ihdr.length)
    out.set(iend, signature.length + ihdr.length + idat.length)
    return out
}

describe('crc32（PNG 规范：IEEE 802.3 多项式，初始/终值取反）', () => {
    it('标准校验值：crc32("123456789") = 0xCBF43926', () => {
        expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
    })

    it('全零输入一致性与已知锚点（IEND 块的 CRC = 0xAE426082）', () => {
        expect(crc32(new Uint8Array(0))).toBe(0)
        expect(crc32(new TextEncoder().encode('IEND'))).toBe(0xae426082)
    })
})

describe('insertPngTextChunk：tEXt 注入（预览导出的文件语义标注）', () => {
    it('在 IHDR 之后插入 tEXt 块，keyword\\0text 数据、长度与 CRC 均正确', () => {
        const out = insertPngTextChunk(minimalPng(), 'CanvasNext', 'preview render, not the final image')
        const chunks = parsePngChunks(out)
        expect(chunks.map((c) => c.type)).toEqual(['IHDR', 'tEXt', 'IDAT', 'IEND'])

        const text = chunks[1]!
        const decoded = new TextDecoder('latin1').decode(text.data)
        expect(decoded).toBe('CanvasNext\0preview render, not the final image')
        // 结构自校验：parsePngChunks 已逐块验证长度域与 CRC 域
        expect(text.data.length).toBe('CanvasNext'.length + 1 + 'preview render, not the final image'.length)
    })

    it('原 PNG 的其余字节保持不变（仅插入，不改写既有块）', () => {
        const png = minimalPng()
        const out = insertPngTextChunk(png, 'CanvasNext', 'preview')
        // 签名 + IHDR 前缀不变，IHDR 之后是新增 tEXt，其后是原 IDAT+IEND
        const ihdrEnd = 8 + 25
        expect(out.subarray(0, ihdrEnd)).toEqual(png.subarray(0, ihdrEnd))
        expect(out.subarray(out.length - (png.length - ihdrEnd))).toEqual(png.subarray(ihdrEnd))
    })

    it('keyword 长度越界（0 或 >79）抛错（tEXt 规范约束）', () => {
        expect(() => insertPngTextChunk(minimalPng(), '', 'x')).toThrow(/keyword/)
        expect(() => insertPngTextChunk(minimalPng(), 'k'.repeat(80), 'x')).toThrow(/keyword/)
    })

    it('非 PNG 字节流（缺 IHDR）抛错；签名不符同样抛错', () => {
        // 签名合法但无 IHDR：签名 + 一个 IEND 块
        const noIhdr = new Uint8Array(8 + 12)
        noIhdr.set(PNG_SIGNATURE, 0)
        const view = new DataView(noIhdr.buffer)
        view.setUint32(8, 0)
        for (let i = 0; i < 4; i += 1) noIhdr[12 + i] = 'IEND'.charCodeAt(i)
        view.setUint32(16, crc32(noIhdr.subarray(12, 16)))
        expect(() => insertPngTextChunk(noIhdr, 'k', 'v')).toThrow(/IHDR/)
        expect(() => insertPngTextChunk(new Uint8Array([1, 2, 3]), 'k', 'v')).toThrow(/签名/)
    })
})
