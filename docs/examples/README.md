# 示例脚本

供外部 AI / 脚本参考的「课程录入」示例，两种方式各给一份。跑之前先启动应用：

```bash
cd ~/Projects/CourseHelper && npm run dev   # 或 npm start（API 在 3001 端口）
```

| 文件 | 方式 | 说明 |
|---|---|---|
| `add_courses.py` | HTTP 命令协议 | Python 示例：填 `COURSES` 列表 → 一次性批量录入（推荐） |
| `batch_commands.json` | HTTP 命令协议 | 现成的批量命令 JSON，配合 `curl` / 任意 HTTP 客户端 |
| `add_courses.sh` | HTTP 命令协议 | 用 curl 直接 POST `batch_commands.json` |
| `file_edit_example.py` | 直接改存档 | Python 示例：读当前存档 `data/saves/<id>.json` → 改 → 原子写回（前端自动刷新） |

完整协议与字段说明见上级目录 [`AI接口协议.md`](../AI接口协议.md)。

---

## 快速上手

### 方式一：HTTP 命令（批量）

```bash
# 改 batch_commands.json 里的课程，然后：
./add_courses.sh

# 或直接用 Python：
python3 add_courses.py
```

### 方式二：直接改存档文件

```bash
python3 file_edit_example.py
# 前端无需刷新，2 秒内自动同步
```

---

## 关键约定速记

- `category`：`builtin`（内置）/ `required`（必修）/ `elective`（非必修）
- `segment` 时间段：`day`(1=周一…7=周日) + `startNode`(起始节) + `step`(连节数) + `startWeek`/`endWeek`(周范围闭区间) + `room` + `teacher`
- 同一门课不同周不同老师 → 多条 `segment`
- 断点/跳周 → 拆成多条 `segment`
