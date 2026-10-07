/**
 * DOM File → 上传文件描述（kbd-nav 工单 05 起被 canvas 域拖放入画布与
 * property-panel 域字体控件两域共用，收口 shared）。本包是浏览器绑定层，触
 * DOM File 类型在此收口——内核 upload.ts 保持 DOM 无关（UploadFile 的
 * name/mime/bytes 最小形态）。
 */
import type { UploadFile } from '@hankchen/canvas-editor'

export async function uploadFileFromDom(file: File): Promise<UploadFile> {
    return { name: file.name, mime: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
}
