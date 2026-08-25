#!/usr/bin/env bash
# 示例：用 curl 批量录入课程（读取同目录 batch_commands.json）
# 前置：先启动应用 `npm run dev`（API 在 3001 端口）
set -euo pipefail

cd "$(dirname "$0")"

curl -sS -X POST http://localhost:3001/api/command \
  -H 'Content-Type: application/json' \
  -d @batch_commands.json \
  | python3 -m json.tool
