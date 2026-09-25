/**
 * 字体清单（工单 13）：编辑会话级的字体可选清单——「清单 ≠ 物化」，core 只持有
 * 引用与展示名，字体的加载仍走渲染端物化管线（FontFace 注册），本模块零 I/O。
 *
 * - 内置清单：宿主在创建会话时配置（URL 列表可配置；缺省为空——宿主不配置即
 *   只有内置默认字体与自定义上传项）。
 * - 自定义字体：上传动作（uploadFont）成功后追加，会话内即可选可用；清单是
 *   会话状态不是文档数据，不进 graph（往返恒等契约禁止私加字段），保存/打开
 *   不携带。
 */
export interface FontCatalogEntry {
    /** 展示名（清单选择器显示；与引用解耦，URL 不直接暴露给编辑者） */
    readonly label: string
    /** 字体引用（URL / data URL），与 TextLayer.font 同域；物化管线按引用装载 */
    readonly ref: string
}

type Listener = (entries: readonly FontCatalogEntry[]) => void

export class FontCatalog {
    private readonly builtin: readonly FontCatalogEntry[]
    private custom: readonly FontCatalogEntry[] = []
    private readonly listeners = new Set<Listener>()

    constructor(builtin: readonly FontCatalogEntry[] = []) {
        this.builtin = [...builtin]
    }

    /** 当前清单：内置在前（配置序），自定义追加在后（上传序） */
    get entries(): readonly FontCatalogEntry[] {
        return [...this.builtin, ...this.custom]
    }

    /** 追加自定义条目；同引用去重（重复上传不产生重复项，首见条目胜出） */
    addCustom(entry: FontCatalogEntry): boolean {
        if (this.entries.some((existing) => existing.ref === entry.ref)) return false
        this.custom = [...this.custom, entry]
        this.notify()
        return true
    }

    /** 订阅清单变更（整体快照推送，绑定层的响应式 ref 据此联动）；返回退订函数 */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }

    private notify(): void {
        const entries = this.entries
        for (const listener of this.listeners) listener(entries)
    }
}
