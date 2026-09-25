/**
 * PNG 字节级工具（工单 13）：tEXt 文本块注入——预览导出的文件语义标注
 * （「预览图，非终图」，ADR 0004）写进 PNG 元数据，随文件走、机器可读；
 * 界面与文件名标注归宿主。纯字节函数、无 DOM（Node 可测）。
 *
 * 块结构：[长度 u32 BE][类型 4B][数据][CRC32 u32 BE]；CRC 覆盖类型+数据
 * （IEEE 802.3 多项式，初始/终值取反）。tEXt 数据 = keyword \0 text，
 * 两段均为 Latin-1（本包只用 ASCII 常量，规范约束不走 UTF-8 通道）。
 */

/** PNG 文件签名（8 字节魔数） */
export const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
    if (crcTable) return crcTable
    const table = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
        let c = n
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
        }
        table[n] = c >>> 0
    }
    crcTable = table
    return table
}

/** PNG 规范的 CRC32（type+data 域校验用） */
export function crc32(bytes: Uint8Array): number {
    const table = getCrcTable()
    let crc = 0xffffffff
    for (let i = 0; i < bytes.length; i += 1) {
        crc = table[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8)
    }
    return (crc ^ 0xffffffff) >>> 0
}

/** 解析出的 PNG 块（类型 + 数据；解析时逐块校验长度域与 CRC 域） */
export interface PngChunk {
    readonly type: string
    readonly data: Uint8Array
}

/** 解析 PNG 块序列：签名/长度/CRC 任一不符即抛错（注入前的完整性门） */
export function parsePngChunks(png: Uint8Array): PngChunk[] {
    for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
        if (png[i] !== PNG_SIGNATURE[i]) throw new Error('不是 PNG 字节流（签名不符）')
    }
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    const chunks: PngChunk[] = []
    let offset = PNG_SIGNATURE.length
    while (offset + 12 <= png.length) {
        const length = view.getUint32(offset)
        const type = String.fromCharCode(png[offset + 4]!, png[offset + 5]!, png[offset + 6]!, png[offset + 7]!)
        const dataStart = offset + 8
        const dataEnd = dataStart + length
        if (dataEnd + 4 > png.length) throw new Error(`PNG 块 ${type} 长度越界`)
        const data = png.subarray(dataStart, dataEnd)
        const expected = view.getUint32(dataEnd)
        const actual = crc32(png.subarray(offset + 4, dataEnd))
        if (expected !== actual) throw new Error(`PNG 块 ${type} CRC 校验失败`)
        chunks.push({ type, data })
        offset = dataEnd + 4
        if (type === 'IEND') break
    }
    return chunks
}

/** 单个 Latin-1 字符串 → 字节（charCode & 0xff；本包输入恒为 ASCII 常量） */
function latin1Bytes(text: string): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(text.length)
    for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff
    return out
}

function encodeChunk(type: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length)
    for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i)
    out.set(data, 8)
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
    return out
}

/**
 * 在 IHDR 之后注入 tEXt 块（keyword\0text），返回新字节流（不改写入参）。
 * 块序 tEXt 紧随 IHDR：任何合法 PNG 解析器都能在图像数据前读到标注。
 * keyword 违反 tEXt 规范（1–79 字节）或缺 IHDR 时抛错。
 */
export function insertPngTextChunk(png: Uint8Array, keyword: string, text: string): Uint8Array<ArrayBuffer> {
    const keywordLength = keyword.length
    if (keywordLength < 1 || keywordLength > 79) throw new Error(`tEXt keyword 长度越界（1–79）：${keywordLength}`)
    if (!parsePngChunks(png).some((chunk) => chunk.type === 'IHDR')) throw new Error('PNG 缺少 IHDR 块')

    const data = new Uint8Array([...latin1Bytes(keyword), 0, ...latin1Bytes(text)])
    const textChunk = encodeChunk('tEXt', data)

    // IHDR 块 = 签名后第一个块，注入点在其后（IHDR 定长 25 字节由 parse 定位，不硬编码）
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
    const ihdrLength = view.getUint32(PNG_SIGNATURE.length)
    const insertAt = PNG_SIGNATURE.length + 12 + ihdrLength

    const out = new Uint8Array(png.length + textChunk.length)
    out.set(png.subarray(0, insertAt), 0)
    out.set(textChunk, insertAt)
    out.set(png.subarray(insertAt), insertAt + textChunk.length)
    return out
}
