/**
 * 工单 04 目验样例：QR 与物化状态机。
 * 仍是宿主交接的 graph JSON 手写体（部分层缺键、带字符串数字，演练宽松解码）。
 *
 * 目验要点：
 * - QR：固定选项（UTF-8、纠错 High、无静区、黑白）生成 PNG 后按盒宽缩放铺放；
 *   未声明 height 按宽兜底正方形（对齐 QrCodeLayer 语义）
 * - 物化状态机：图片/字体/QR 经 Materializer 异步物化，pending 灰叉占位、
 *   done 绘制真实内容、failed 红叉红框（/demo-missing.png 演示失败态）
 * - 中文长段 autowrap + 禁则；家庭 emoji 字素簇；图片 cover；URL 字体（工单 03）
 * - priority 叠放：100 背景 → 40 图片 → 30 文字 → 25 段落 → 15 表格 → 12 失败演示 → 10 QR 最上
 */
export const DEMO_GRAPH_JSON = `{
  "canvas": { "width": 560, "height": 420 },
  "layers": [
    {
      "type": "ImageLayer",
      "priority": 100,
      "spec": {
        "shape": { "width": 560, "height": 420, "backgroundColor": "#0f172a" },
        "position": { "x": 0, "y": 0, "position": "top-left" }
      }
    },
    {
      "type": "ImageLayer",
      "priority": 40,
      "spec": {
        "shape": {
          "width": 200, "height": 150, "backgroundColor": "#1e293b",
          "padding": { "top": 8, "bottom": 8, "left": 8, "right": 8 },
          "border": { "top": { "width": 1, "color": "#334155" }, "bottom": { "width": 1, "color": "#334155" }, "left": { "width": 1, "color": "#334155" }, "right": { "width": 1, "color": "#334155" } }
        },
        "position": { "x": 24, "y": 24, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "/demo-cover.svg" }
    },
    {
      "type": "TextLayer",
      "priority": 30,
      "spec": {
        "shape": { "width": 220, "height": 48, "backgroundColor": "#0c4a6e" },
        "align": { "horizontal": "left", "vertical": "center" },
        "position": { "x": 24, "y": 204, "position": "top-left" },
        "fontFamily": { "font": "/fonts/open-sans.ttf", "fontSize": 20, "fontColor": "#38bdf8" }
      },
      "data": { "valueType": "StaticValue", "expression": "", "value": "Open Sans 0123" }
    },
    {
      "type": "TextLayer",
      "priority": 25,
      "spec": {
        "shape": {
          "width": 200, "height": "auto", "autoHeight": true, "lineHeight": 1.5,
          "backgroundColor": "rgba(15, 23, 42, 0.72)",
          "padding": { "top": 12, "bottom": 12, "left": 12, "right": 12 },
          "border": { "left": { "width": 4, "color": "#0ea5e9" } }
        },
        "align": { "horizontal": "left", "vertical": "bottom" },
        "position": { "x": 340, "y": 24, "position": "top-left" },
        "fontFamily": { "fontSize": 16, "fontColor": "#e2e8f0", "autowrap": true }
      },
      "data": {
        "valueType": "StaticValue",
        "expression": "",
        "value": "画布渲染库的中文长段按贪心策略逐簇断行，行首不见句读、行末不见起始标点。\\n\\n家庭 emoji 👨‍👩‍👧‍👦 是一个字素簇，断行不拆碎👍"
      }
    },
    {
      "type": "TableLayer",
      "priority": 15,
      "spec": {
        "shape": {
          "width": 300, "height": 100, "backgroundColor": "#0ea5e9",
          "border": { "top": { "width": 2, "color": "#e2e8f0" }, "bottom": { "width": 2, "color": "#e2e8f0" } }
        },
        "position": { "x": 24, "y": 280, "position": "top-left" }
      },
      "rows": [
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": "300", "height": 45 } },
          "cells": [
            { "type": "TableCellLayer", "spec": { "shape": { "width": 150, "height": 45, "backgroundColor": "#fbbf24" } } },
            { "type": "TableCellLayer", "spec": { "shape": { "width": 150, "height": 45, "backgroundColor": "#f97316" } } }
          ]
        },
        {
          "type": "TableRowLayer",
          "spec": { "shape": { "width": "300", "height": 55 } },
          "cells": [
            {
              "type": "TableCellLayer",
              "spec": { "shape": { "width": 150, "height": 55, "backgroundColor": "#a78bfa" } },
              "content": {
                "type": "TextLayer",
                "spec": {
                  "shape": { "width": 150, "height": 55, "padding": { "top": 0, "bottom": 8, "left": 10, "right": 10 } },
                  "fontFamily": { "fontSize": 12, "fontColor": "#ffffff" }
                },
                "data": { "valueType": "StaticValue", "value": "单元格文本" }
              }
            },
            { "type": "TableCellLayer", "spec": { "shape": { "width": 150, "height": 55, "backgroundColor": "#fb7185" } } }
          ]
        }
      ]
    },
    {
      "type": "ImageLayer",
      "priority": 12,
      "spec": {
        "shape": {
          "width": 70, "height": 70, "backgroundColor": "#1e293b",
          "border": { "top": { "width": 1, "color": "#f87171" }, "bottom": { "width": 1, "color": "#f87171" }, "left": { "width": 1, "color": "#f87171" }, "right": { "width": 1, "color": "#f87171" } }
        },
        "position": { "x": 260, "y": 200, "position": "top-left" }
      },
      "data": { "valueType": "StaticValue", "value": "/demo-missing.png" }
    },
    {
      "type": "QrCodeLayer",
      "priority": 10,
      "spec": {
        "shape": {
          "width": 72, "backgroundColor": "#38bdf8",
          "border": { "top": { "width": 3, "color": "#f8fafc" }, "bottom": { "width": 3, "color": "#f8fafc" }, "left": { "width": 3, "color": "#f8fafc" }, "right": { "width": 3, "color": "#f8fafc" } }
        },
        "position": { "x": -16, "y": -16, "position": "bottom-right" }
      },
      "data": { "valueType": "StaticValue", "value": "https://example.com" }
    }
  ]
}`
