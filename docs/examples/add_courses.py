#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""示例：用 HTTP 命令协议「一次性」批量录入课程。

前置：先启动应用  `npm run dev`（API 在 http://localhost:3001）。

用法：
    python3 add_courses.py

它会读取下方 COURSES 列表，转成一批 add_course 命令（每条自带时间段），
POST 到 /api/command，一次完成全部录入。改 COURSES 即可录入你的课程。
"""
import json
import urllib.request

API = "http://localhost:3001/api/command"

# ===== 照着这个格式填你的课程 =====
COURSES = [
    {
        "name": "数据结构",
        "category": "builtin",   # builtin=内置 / required=必修 / elective=非必修
        "code": "U03G11010",     # 课程编号（查重用，可为空字符串）
        "credit": 3.5,
        "options": [             # 候选（教学班），每个候选自带已选/容量与时间段
            {
                "label": "张三 班",
                "rating": 4.2,    # 候选总体评分 0-5
                "enrolled": 120,  # 该候选已选人数 m
                "capacity": 100,  # 该候选容量 n
                "segments": [
                    {"day": 1, "startNode": 3, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教西B-201", "teacher": "张三"},
                    {"day": 3, "startNode": 3, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教西B-201", "teacher": "张三"},
                ],
            },
        ],
    },
    {
        "name": "操作系统",
        "category": "required",
        "code": "U03G11011",
        "credit": 3.0,
        "options": [
            {
                "label": "李四 班",
                "rating": 0,
                "enrolled": 0,
                "capacity": 0,
                "segments": [
                    {"day": 2, "startNode": 5, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教东A-301", "teacher": "李四"},
                ],
            },
        ],
    },
]


def main():
    commands = [
        {
            "op": "add_course",
            "name": c["name"],
            "category": c["category"],
            "code": c.get("code", ""),
            "credit": c.get("credit", 0),
            "options": c.get("options", []),
        }
        for c in COURSES
    ]

    req = urllib.request.Request(
        API,
        data=json.dumps(commands, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    print(f"ok={result.get('ok')}  应用命令 {result.get('applied')} 条")
    print("当前课程总数：", len(result.get("schedule", {}).get("courses", [])))


if __name__ == "__main__":
    main()
