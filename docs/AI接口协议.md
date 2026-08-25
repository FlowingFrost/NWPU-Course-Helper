# 选课助手 · 外部 AI 交互协议

外部 AI（Claude Code、Cursor、任何能发 HTTP 或读写文件的 Agent/脚本）有两种方式操作本应用：

1. **HTTP 命令协议（推荐）**：向 `POST /api/command` 发送结构化 JSON 命令，服务端自动应用并落盘。
2. **直接改存档文件**：直接编辑当前存档文件（`data/saves/<id>.json`），前端**每 2 秒自动检测并刷新**，无需手动刷新页面。

两种方式都支持**一次执行多条命令（批量）**。

---

## 一、HTTP 命令协议

### 端点

```
POST http://localhost:3001/api/command
Content-Type: application/json
```

请求体三种形式均可：

```jsonc
{ "op": "add_course", "name": "机械原理Ⅱ", "category": "builtin" }        // 单条
[ { "op": "..." }, { "op": "..." } ]                                        // 数组（批量）
{ "commands": [ { "op": "..." }, { "op": "..." } ] }                        // 包装
```

响应：

```jsonc
{ "ok": true, "applied": 2, "schedule": { /* 最新完整课程表 */ } }
```

### 命令一览（按 `op` 字段区分）

| op | 作用 | 必填 | 可选 |
|---|---|---|---|
| `add_course` | 新增一门课（内置/必修/非必修），可**一步带时间段** | `name`, `category` | `code`, `credit`, `color`, `segments`, `options`（候选含 `enrolled`/`capacity`） |
| `add_option` | 给已有课**追加候选**（含时间段） | `courseId` | `label`, `rating`, `segments` |
| `update_option` | **修改某候选**（可整体替换时间段/评分/标签） | `optionId`, `patch` | — |
| `set_selected` | **标记/取消**某候选为「确认选」（确认要选，≠ 选课成功） | `optionId`, `selected` | — |
| `set_rating` | 设置候选总体评分 | `optionId`, `rating` | — |
| `set_enrollment` | 设置某候选的已选人数/容量 | `optionId`, `enrolled`, `capacity` | — |
| `set_willing` | 手动覆盖意愿值 | `courseId`, `willingOverride` | — |
| `update_course` | 修改课程字段（名称/编号/学分/类别…） | `courseId`, `patch` | — |
| `delete_course` | 删除课程 | `courseId` | — |
| `update_meta` | 修改元信息（学分上限/预算/周数/节数…） | `patch` | — |

### 字段约定

- `category`：`"builtin"`（内置）｜`"required"`（必修）｜`"elective"`（非必修）
- `segment`（时间段）对象：
  ```jsonc
  { "day": 1, "startNode": 1, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教西A-104", "teacher": "谷文韬" }
  ```
  - `day`：1=周一 … 7=周日
  - `startNode` 起始节次、`step` 连节数（如 `startNode=1, step=2` = 第 1~2 节）
  - `startWeek`/`endWeek`：闭区间周范围（断点/跳周 = 拆成多条 segment）
- **id 查询**：课程/候选的 `id`、`optionId` 通过 `GET http://localhost:3001/api/schedule` 查看（每个课程有 `id`，每个候选有 `options[].id`）。

### 示例：你的 5 件事

#### 1. 录入全新课程（内置 + 时间段，一步到位）

```jsonc
{
  "op": "add_course",
  "name": "数据结构",
  "category": "builtin",
  "code": "U03G11010",
  "credit": 3.5,
  "options": [
    {
      "label": "张三 班",
      "rating": 4.2,
      "enrolled": 120,
      "capacity": 100,
      "segments": [
        { "day": 1, "startNode": 3, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教西B-201", "teacher": "张三" },
        { "day": 3, "startNode": 3, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教西B-201", "teacher": "张三" }
      ]
    }
  ]
}
```

#### 2. 追加候选（给某课加一个新候选 + 时间段）

```jsonc
{
  "op": "add_option",
  "courseId": "crs_xxx",
  "label": "李四 班",
  "rating": 4.2,
  "segments": [
    { "day": 2, "startNode": 1, "step": 2, "startWeek": 1, "endWeek": 16, "room": "教东A-301", "teacher": "李四" }
  ]
}
```

#### 3. 修改候选时间段（整体替换 segments）

```jsonc
{
  "op": "update_option",
  "optionId": "opt_yyy",
  "patch": {
    "segments": [
      { "day": 4, "startNode": 5, "step": 2, "startWeek": 1, "endWeek": 12, "room": "教西C-102", "teacher": "王五" }
    ]
  }
}
```

#### 4. 修改课程时间段（内置课候选同理）

内置课就是「已经选课成功、只有一个候选且 `selected: true`」的课，同样用 `update_option` 替换其 `options[0]` 的 `segments`。

#### 5. 确认选某门课的某个时间段（标记确认选）

```jsonc
{ "op": "set_selected", "optionId": "opt_yyy", "selected": true }
// 取消则 selected: false
```

#### 批量：一次完成多条（推荐，减少往返）

```jsonc
[
  { "op": "add_course", "name": "数据库", "category": "required", "credit": 3 },
  { "op": "update_course", "courseId": "crs_old", "patch": { "credit": 4 } },
  { "op": "set_selected", "optionId": "opt_a", "selected": true }
]
```

> 注意：`add_course` 后要引用其新 id/optionId 时，新课程和候选会出现在响应里的 `schedule` 字段中；或直接走「方式二」直接改文件，更直观。

---

## 二、直接改存档文件 + 自动刷新

对于能力较强的 AI（能读文件、写文件），**直接编辑当前存档文件是最简单、最不易出错的**——不需要记命令、不需要查 id，直接按 JSON 结构增删改即可。

- 文件路径：`data/saves/<当前存档id>.json`（当前存档 id 见 `data/settings.json` 的 `currentSaveId` 字段）
- 前端每 **2 秒**轮询该文件，检测到变化后自动刷新课表与课程面板，无需手动刷新浏览器。
- 服务端每个请求都从磁盘读最新文件，因此外部写入后 `GET /api/schedule` 立即反映最新数据。

### 顶层结构

```jsonc
{
  "meta": { "school": "...", "term": "...", "nodesPerDay": 13, "totalWeeks": 16, "creditCap": 30, "willingBudget": 150, ... },
  "nodeTimes": [ { "node": 1, "start": "08:30", "end": "09:15" }, ... ],
  "teacherRatings": [],
  "courses": [
    {
      "id": "crs_xxx",
      "code": "U03G11004",
      "name": "机械原理Ⅱ",
      "category": "builtin",          // builtin | required | elective
      "credit": 3.5,
      "willingOverride": null,         // 手动覆盖意愿值，null=自动算
      "participating": true,           // 非必修是否参与排课
      "color": "#ff1744ff",
      "options": [
        {
          "id": "opt_xxx",
          "label": "谷文韬/董典彪 班",
          "rating": 4.2,               // 候选总体评分 0-5
          "selected": true,            // 是否「确认选」（确认要选；内置课=已选课成功）
          "enrolled": 120,             // m：该候选（教学班）已选人数
          "capacity": 100,             // n：该候选（教学班）容量
          "segments": [
            { "day": 1, "startNode": 1, "step": 2, "startWeek": 1, "endWeek": 5, "room": "教西A-104", "teacher": "谷文韬" }
          ]
        }
      ]
    }
  ]
}
```

### 注意事项

1. **原子写入**：建议「写临时文件再 rename 覆盖」，避免读到半截 JSON（应用对损坏 JSON 会回退到空课表，但不会崩溃）。
2. **内置课** = `category: "builtin"` + 单个候选且 `selected: true`（已选课成功，不投入意愿值）。
3. **必修课** = `category: "required"`，多候选，最终确认选一个 `selected: true`（超容量仍投入意愿值）。
4. **非必修课** = `category: "elective"`，需 `participating: true` 才参与排课。
5. 同一门课不同周不同老师 = 多条 `segment`（各自带 `teacher`/`startWeek`/`endWeek`）。
6. **已选人数/容量在候选级**：每个候选（教学班）有独立的 `enrolled`/`capacity`，课程级不再存储。

---

## 三、两种方式怎么选

| 场景 | 推荐 |
|---|---|
| 批量录入 / 结构清晰的一次性操作 | HTTP 命令协议（`/api/command` 数组） |
| 复杂修改、需要看上下文、边读边改 | 直接改当前存档 `data/saves/<id>.json`（自动刷新） |
| 内置对话（DeepSeek） | 网页里「AI 录入」面板 |

两种方式最终都落到同一份当前存档文件，可以混用。
