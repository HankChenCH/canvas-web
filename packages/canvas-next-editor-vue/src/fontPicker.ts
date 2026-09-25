/**
 * 字体选择控件的宿主注入缝（工单 13）：控件需要宿主级的字体清单与上传实现，
 * 而属性控件的 props 契约只有 field/modelValue——清单经 provide/inject 接线
 * （宿主 provide 一次，控件树任意深度可取）。宿主未注入时控件退化为文本输入。
 *
 * 数据源接线内核（canvas-next-editor）：entries 来自 FontCatalog（内置清单可
 * 配置 + 上传追加），uploadFont 即 EditorSession.uploadFont（经注入的
 * uploadHandler 实现）——控件不持有任何上传实现。
 */
import { inject, type InjectionKey, type Ref } from 'vue'

import type { FontCatalogEntry, UploadFile } from '@hankchen/canvas-next-editor'

export interface FontPickerContext {
    /** 字体清单（内置 + 自定义，响应式快照——上传追加后下拉实时联动） */
    readonly entries: Ref<readonly FontCatalogEntry[]>
    /** 上传可用性（内核 canUpload：未注入 uploadHandler 即 false） */
    readonly canUpload: boolean
    /** 本机字体 → 可物化引用（内核 uploadFont：引用入清单后返回） */
    readonly uploadFont: (file: UploadFile) => Promise<string>
}

export const FONT_PICKER_KEY: InjectionKey<FontPickerContext> = Symbol('canvas-next-font-picker')

/** 控件 setup 内取注入缝；未注入返回 null（控件退化） */
export function injectFontPicker(): FontPickerContext | null {
    return inject(FONT_PICKER_KEY, null)
}

/**
 * DOM File → 上传文件描述（共享组装：playground 工具栏与本包 FontField 同款）。
 * 本包是浏览器绑定层，触 DOM File 类型在此收口（内核 upload.ts 保持 DOM 无关）。
 */
export async function uploadFileFromDom(file: File): Promise<UploadFile> {
    return { name: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
}
