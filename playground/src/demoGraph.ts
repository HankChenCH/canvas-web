/**
 * 工单 03 目验样例：文本与图片渲染。
 * 仍是宿主交接的 graph JSON 手写体（部分层缺键、带字符串数字，演练宽松解码）。
 *
 * 目验要点：
 * - 中文长段 autowrap：贪心逐簇断行 + 禁则（行首不见句读、行末不见起始标点），
 *   显式换行的空行保留，autoHeight 随行数生长
 * - 字素簇：家庭 emoji 👨‍👩‍👧‍👦 按单簇计宽断行，不拆碎
 * - 图片 cover：源图 400×16:9 宽幅 → 等比缩放居中裁切，中缝圆标落在内容盒中线
 * - URL 字体：/fonts/open-sans.ttf 经 FontFace 注册后生效（失败回落系统默认）
 * - priority 叠放：100 背景 → 40 图片 → 30 文字 → 25 段落 → 15 表格 → 10 QR 最上
 * - QR 仍为占位盒（二维码生成随物化在工单 04 接入）
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
      "type": "QrCodeLayer",
      "priority": 10,
      "spec": {
        "shape": {
          "width": 72, "height": 72, "backgroundColor": "#38bdf8",
          "border": { "top": { "width": 3, "color": "#f8fafc" }, "bottom": { "width": 3, "color": "#f8fafc" }, "left": { "width": 3, "color": "#f8fafc" }, "right": { "width": 3, "color": "#f8fafc" } }
        },
        "position": { "x": -16, "y": -16, "position": "bottom-right" }
      },
      "data": { "valueType": "StaticValue", "value": "https://example.com" }
    }
  ]
}`
