#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""示例：直接改当前存档文件（data/saves/<id>.json，前端每 2 秒自动刷新，无需手动刷新页面）。

这种方式最适合「读上下文 → 修改 → 写回」的复杂操作，也最不容易出错——
按 JSON 结构直接增删改即可，不用记命令、不用查 id。

用法：
    python3 file_edit_example.py
"""
import json
import os
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def current_save_path():
    """读取 settings.json 的 currentSaveId，返回当前存档文件路径。"""
    with open(os.path.join(ROOT, "data", "settings.json"), encoding="utf-8") as f:
        settings = json.load(f)
    save_id = settings.get("currentSaveId", "default")
    return os.path.join(ROOT, "data", "saves", f"{save_id}.json")


def atomic_write(obj, path):
    """原子写入：先写临时文件，再 rename 覆盖，避免前端读到半截 JSON。"""
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        os.replace(tmp, path)
    except Exception:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise


def main():
    with open(current_save_path(), encoding="utf-8") as f:
        schedule = json.load(f)

    # ===== 下面照你的需要改（示例：补编号 + 改类别）=====
    for course in schedule.get("courses", []):
        if not course.get("code"):
            course["code"] = "AUTO_" + course["name"][:6]

    for course in schedule.get("courses", []):
        if course["name"] == "操作系统":
            course["category"] = "required"   # builtin / required / elective

    # 新增一门课（直接 append 一条完整结构）
    schedule.setdefault("courses", []).append(
        {
            "id": "crs_manual_demo",
            "code": "U03G11099",
            "name": "人工智能导论",
            "category": "elective",
            "credit": 2.0,
            "willingOverride": None,
            "participating": True,
            "color": "#1de9b6ff",
            "options": [
                {
                    "id": "opt_manual_demo",
                    "label": "",
                    "rating": 4.0,
                    "selected": False,
                    "enrolled": 0,
                    "capacity": 0,
                    "segments": [
                        {"day": 5, "startNode": 7, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教西A-204", "teacher": "王五"}
                    ],
                }
            ],
        }
    )

    atomic_write(schedule, current_save_path())
    print("已写入，前端会在 2 秒内自动刷新。")


if __name__ == "__main__":
    main()
