/**
 * 工单 05 目验样例：相机与视口——2400×1500 数千像素画布，导航才有意义。
 * 仍是宿主交接的 graph JSON 手写体（部分层缺键、带字符串数字，演练宽松解码）。
 *
 * 布局分左右两区，平移/缩放才能看全：
 * - 左区（x≈96–760）：背景、cover 图片、URL 字体标题、autowrap 中文长段（禁则 +
 *   emoji 字素簇）、表格、失败演示资源
 * - 右区（x≈1200–2200）：大字展示文本、第二段落、第二张 cover 图
 * - 中列（x≈816 起）工票 03 增补的 V2 目验区（自上而下）：
 *   - 标记图片：ExpressionValue 三键、value 恒镜像 expression（`{{org.logo}}`），
 *     预览按字面引用装载失败 → 占位 + 红叉（既有物化失败态机，不崩渲染）
 *   - 标记二维码：字面 `{{certNo}}` 按字面出码（编辑器不求值）
 *   - 标记文本：显示镜像字面 `证书 {{certName}} · 编号 {{certNo}}`（spec §3.7 降级形态）
 *   - 模板态表格：data 键值仅 rowsPath + template 内嵌行模板（标记 Text/Image/Qr
 *     内容层各一；行/格声明高与 autoHeight 混合 = 高度豁免的 wire 形态演练），
 *     rows 不写键 → 渲染为空壳（bg/border 照画、行区零高，spec §4.4 同门）
 * - 表达式键树与样例 schema（sampleDatasetSchema.ts 证书 form-data，工单 11）对齐：
 *   根层 certNo/certName、嵌套 org.logo、rowsPath = originCertificates（行上下文
 *   row.certName/row.fileUrl/row.certNo + $index）
 * - QR 挂画布 bottom-right（-32,-32 负溢出不钳位）
 * - priority 叠放（数组头先画垫底）：100 背景 → 40 → 38 → 35 → 30 → 25 → 20 →
 *   15 → 14 → 13 → 12 → 11 → 10 QR → 9 最上
 * - 工单 04 的物化三态保留可目验：/demo-missing.png 失败红叉、URL 字体、QR 固定选项
 *
 * 落点选择（工票 03）：样例增补落 DEMO_GRAPH_JSON（打开 playground 默认载入即可见，
 * 无需额外点击）；visualCheckGraph（php visual-check 同场景口径）保持不动。
 */
export const DEMO_GRAPH_JSON = `{
  "canvas": { "width": 2400, "height": 1500 },
  "layers": [
    {
      "type": "ImageLayer",
      "priority": 100,
      "spec": {
        "shape": { "width": 2400, "height": 1500, "backgroundColor": "#0f172a" },
        "position": { "x": 0, "y": 0, "position": "top-left" }
      }
    },
    {
      "type": "ImageLayer",
      "priority": 40,
      "spec": {
        "shape": {
          "width": 480, "height": 360, "backgroundColor": "#1e293b",
          "padding": { "top": 10, "bottom": 10, "left": 10, "right": 10 },
          "border": { "top": { "width": 1, "color": "#334155" }, "bottom": { "width": 1, "color": "#334155" }, "left": { "width": 1, "color": "#334155" }, "right": { "width": 1, "color": "#334155" } }
        },
        "position": { "x": 96, "y": 96, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "/demo-cover.svg" }
    },
    {
      "type": "ImageLayer",
      "priority": 38,
      "spec": {
        "shape": {
          "width": 400, "height": 300, "backgroundColor": "#1e293b",
          "padding": { "top": 8, "bottom": 8, "left": 8, "right": 8 }
        },
        "position": { "x": 1640, "y": 980, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "/demo-cover.svg" }
    },
    {
      "type": "TextLayer",
      "priority": 35,
      "spec": {
        "shape": { "width": 900, "height": 140, "backgroundColor": "rgba(56, 189, 248, 0.12)" },
        "align": { "horizontal": "center", "vertical": "center" },
        "position": { "x": 1240, "y": 260, "position": "top-left" },
        "fontFamily": { "fontSize": "72", "fontColor": "#38bdf8" }
      },
      "data": { "valueType": "StaticValue", "expression": "", "value": "大画布导航目验" }
    },
    {
      "type": "TextLayer",
      "priority": 30,
      "spec": {
        "shape": { "width": 560, "height": 72, "backgroundColor": "#0c4a6e" },
        "align": { "horizontal": "left", "vertical": "center" },
        "position": { "x": 96, "y": 520, "position": "top-left" },
        "fontFamily": { "font": "/fonts/open-sans.ttf", "fontSize": 40, "fontColor": "#38bdf8" }
      },
      "data": { "valueType": "StaticValue", "expression": "", "value": "Open Sans 0123 海报" }
    },
    {
      "type": "TextLayer",
      "priority": 25,
      "spec": {
        "shape": {
          "width": 480, "height": "auto", "autoHeight": true, "lineHeight": 1.6,
          "backgroundColor": "rgba(15, 23, 42, 0.72)",
          "padding": { "top": 16, "bottom": 16, "left": 16, "right": 16 },
          "border": { "left": { "width": 6, "color": "#0ea5e9" } }
        },
        "align": { "horizontal": "left", "vertical": "bottom" },
        "position": { "x": 96, "y": 640, "position": "top-left" },
        "fontFamily": { "fontSize": 18, "fontColor": "#e2e8f0", "autowrap": true }
      },
      "data": {
        "valueType": "StaticValue",
        "expression": "",
        "value": "画布渲染库的中文长段按贪心策略逐簇断行，行首不见句读、行末不见起始标点。\\n\\n家庭 emoji 👨‍👩‍👧‍👦 是一个字素簇，断行不拆碎👍 放大到 800% 看物理像素是否清晰。"
      }
    },
    {
      "type": "TextLayer",
      "priority": 20,
      "spec": {
        "shape": {
          "width": 700, "height": "auto", "autoHeight": true, "lineHeight": 1.5,
          "backgroundColor": "rgba(15, 23, 42, 0.6)",
          "padding": { "top": 14, "bottom": 14, "left": 14, "right": 14 }
        },
        "align": { "horizontal": "left", "vertical": "bottom" },
        "position": { "x": 1240, "y": 470, "position": "top-left" },
        "fontFamily": { "fontSize": "22", "fontColor": "#cbd5e1", "autowrap": true }
      },
      "data": {
        "valueType": "StaticValue",
        "expression": "",
        "value": "视口 {x, y, zoom} 住 store 的 ui 分支，永不进历史；重绘经 rAF 合帧，每屏帧至多一次。\\n\\n滚轮语义三态：plain 平移、shift 横移、ctrl/双指捏合以指针为中心缩放（5%–800%）。"
      }
    },
    {
      "type": "TableLayer",
      "priority": 15,
      "spec": {
        "shape": {
          "width": 600, "height": 200, "backgroundColor": "#0ea5e9",
          "border": { "top": { "width": 2, "color": "#e2e8f0" }, "bottom": { "width": 2, "color": "#e2e8f0" } }
        },
        "position": { "x": 96, "y": 1120, "position": "top-left" }
      },
      "rows": [
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": "600", "height": 90 } },
          "cells": [
            { "type": "TableCellLayer", "spec": { "shape": { "width": 300, "height": 90, "backgroundColor": "#fbbf24" } } },
            { "type": "TableCellLayer", "spec": { "shape": { "width": 300, "height": 90, "backgroundColor": "#f97316" } } }
          ]
        },
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": "600", "height": 110 } },
          "cells": [
            {
              "type": "TableCellLayer",
              "spec": { "shape": { "width": 300, "height": 110, "backgroundColor": "#a78bfa" } },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 300, "height": 110, "padding": { "top": 0, "bottom": 16, "left": 20, "right": 20 } },
                  "fontFamily": { "fontSize": 24, "fontColor": "#ffffff" }
                },
                "data": { "valueType": "StaticValue", "value": "单元格文本" }
              }
            },
            { "type": "TableCellLayer", "spec": { "shape": { "width": 300, "height": 110, "backgroundColor": "#fb7185" } } }
          ]
        }
      ]
    },
    {
      "type": "TableLayer",
      "priority": 14,
      "spec": {
        "shape": {
          "width": 600, "height": 200, "backgroundColor": "#155e75",
          "padding": { "top": 12, "bottom": 12, "left": 12, "right": 12 },
          "border": { "top": { "width": 2, "color": "#67e8f9" }, "bottom": { "width": 2, "color": "#67e8f9" }, "left": { "width": 2, "color": "#67e8f9" }, "right": { "width": 2, "color": "#67e8f9" } }
        },
        "position": { "x": 816, "y": 1120, "position": "top-left" }
      },
      "data": { "rowsPath": "originCertificates" },
      "template": {
        "type": "TableRowTemplate",
        "spec": { "shape": { "width": 600, "height": 0, "autoHeight": true } },
        "cells": [
          {
            "type": "TableCellLayer",
            "spec": { "shape": { "width": 240, "height": 0, "autoHeight": true, "backgroundColor": "#0e7490" } },
            "content": {
              "type": "TextLayer",
              "spec": {
                "shape": { "width": 240, "height": "auto", "padding": { "top": 6, "bottom": 6, "left": 12, "right": 12 } },
                "fontFamily": { "fontSize": 16, "fontColor": "#e0f2fe" }
              },
              "data": { "valueType": "ExpressionValue", "expression": "证书：{{row.certName}}（{{$index}}）", "value": "证书：{{row.certName}}（{{$index}}）" }
            }
          },
          {
            "type": "TableCellLayer",
            "spec": { "shape": { "width": 180, "height": 48, "backgroundColor": "#0369a1" } },
            "content": {
              "type": "ImageLayer",
              "spec": { "shape": { "width": 180, "height": 48 } },
              "data": { "valueType": "ExpressionValue", "expression": "{{row.fileUrl}}", "value": "{{row.fileUrl}}" }
            }
          },
          {
            "type": "TableCellLayer",
            "spec": { "shape": { "width": 180, "height": 48 } },
            "content": {
              "type": "QrCodeLayer",
              "spec": { "shape": { "width": 180, "height": 48 } },
              "data": { "valueType": "ExpressionValue", "expression": "{{row.certNo}}", "value": "{{row.certNo}}" }
            }
          }
        ]
      }
    },
    {
      "type": "ImageLayer",
      "priority": 13,
      "spec": {
        "shape": {
          "width": 200, "height": 140, "backgroundColor": "#164e63",
          "padding": { "top": 8, "bottom": 8, "left": 8, "right": 8 }
        },
        "position": { "x": 816, "y": 96, "position": "top-left" }
      },
      "data": { "valueType": "ExpressionValue", "expression": "{{org.logo}}", "value": "{{org.logo}}" }
    },
    {
      "type": "ImageLayer",
      "priority": 12,
      "spec": {
        "shape": {
          "width": 140, "height": 140, "backgroundColor": "#1e293b",
          "border": { "top": { "width": 2, "color": "#f87171" }, "bottom": { "width": 2, "color": "#f87171" }, "left": { "width": 2, "color": "#f87171" }, "right": { "width": 2, "color": "#f87171" } }
        },
        "position": { "x": 660, "y": 96, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "/demo-missing.png" }
    },
    {
      "type": "TextLayer",
      "priority": 11,
      "spec": {
        "shape": { "width": 400, "height": 72, "backgroundColor": "rgba(103, 232, 249, 0.16)" },
        "align": { "horizontal": "left", "vertical": "center" },
        "position": { "x": 816, "y": 500, "position": "top-left" },
        "fontFamily": { "fontSize": 24, "fontColor": "#67e8f9" }
      },
      "data": { "valueType": "ExpressionValue", "expression": "证书 {{certName}} · 编号 {{certNo}}", "value": "证书 {{certName}} · 编号 {{certNo}}" }
    },
    {
      "type": "QrCodeLayer",
      "priority": 10,
      "spec": {
        "shape": {
          "width": 144, "backgroundColor": "#38bdf8",
          "border": { "top": { "width": 6, "color": "#f8fafc" }, "bottom": { "width": 6, "color": "#f8fafc" }, "left": { "width": 6, "color": "#f8fafc" }, "right": { "width": 6, "color": "#f8fafc" } }
        },
        "position": { "x": -32, "y": -32, "position": "bottom-right" }
      },
      "data": { "valueType": "StaticValue", "value": "https://example.com" }
    },
    {
      "type": "QrCodeLayer",
      "priority": 9,
      "spec": {
        "shape": { "width": 144, "backgroundColor": "#155e75" },
        "position": { "x": 816, "y": 300, "position": "top-left" }
      },
      "data": { "valueType": "ExpressionValue", "expression": "{{certNo}}", "value": "{{certNo}}" }
    }
  ]
}`
