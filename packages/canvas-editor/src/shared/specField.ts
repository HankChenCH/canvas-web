/**
 * spec 字段路径读写原语（shared）：沿图层内字段路径（如 ['shape','backgroundColor']、
 * 单段 ['fontSize']）下降读取/原位写入。updateSpec（属性面板权威写入口）与样式
 * 粘贴（editing/styleClipboard 的快照抓取与逐字段落地）共用同一套下降语义。
 *
 * 中间段悬空（null/非对象）即放弃：字段形态由上层（领域类型/注册表）把关，
 * 原语只做防御性下降。写入侧尾段原位赋值，immer draft 语义下生效。
 */

/** 沿字段路径下降读取；目标不是对象或中间段悬空返回 undefined */
export function readSpecField(target: unknown, key: readonly string[]): unknown {
    let node: unknown = target
    for (let i = 0; i < key.length - 1; i += 1) {
        if (node === null || typeof node !== 'object') return undefined
        node = (node as Record<string, unknown>)[key[i]!]
    }
    if (node === null || typeof node !== 'object') return undefined
    return (node as Record<string, unknown>)[key[key.length - 1]!]
}

/**
 * 沿字段路径下降写入（中间段悬空即放弃；尾段原位赋值，immer draft 语义下生效）。
 * 返回是否真写入——调用方据此统计落地字段（悬空放弃不计）。
 */
export function writeSpecField(target: unknown, key: readonly string[], value: unknown): boolean {
    if (target === null || typeof target !== 'object') return false
    let node: unknown = target
    for (let i = 0; i < key.length - 1; i += 1) {
        const next: unknown = (node as Record<string, unknown>)[key[i]!]
        if (next === null || typeof next !== 'object') return false
        node = next
    }
    ;(node as Record<string, unknown>)[key[key.length - 1]!] = value
    return true
}
