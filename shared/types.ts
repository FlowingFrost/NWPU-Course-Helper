// 共享数据模型 —— 与 DESIGN.md §4 对齐

export type Category = 'builtin' | 'required' | 'elective';

export interface Segment {
  day: number; // 1=周一 … 7=周日
  startNode: number; // 起始节
  step: number; // 连节数
  startWeek: number; // 起始周（闭区间）
  endWeek: number; // 结束周（闭区间）
  room: string;
  teacher: string;
}

export interface Option {
  id: string;
  label: string;
  rating: number; // 候选总体评分 0-5
  selected: boolean; // 确认选该候选（确认要选，超容量仍计意愿值；内置课恒为 true）
  enrolled: number; // 该候选（教学班）已选人数 m
  capacity: number; // 该候选（教学班）容量 n
  selectable?: boolean; // 是否开放选课（true=开放/可勾选，false=不开放，undefined=未知）
  locked?: boolean; // 锁定：粘贴/解析时不覆盖该候选的信息（协调开课时间用）
  segments: Segment[];
}

export interface Course {
  id: string;
  code: string; // 课程编号（查重主键）
  name: string;
  category: Category;
  credit: number;
  willingOverride: number | null;
  participating?: boolean; // 是否参与排课（必修/非必修均可关）
  linkId?: string; // 串联组：同组不同编号/名称的课排课时只选其一
  color: string;
  options: Option[];
}

export interface NodeTime {
  node: number;
  start: string;
  end: string;
}

export interface TeacherRating {
  name: string;
  rating: number;
}

// 显示课程信息的内容位（教师/周次/地点）
export interface InfoBits {
  teacher: boolean;
  week: boolean;
  room: boolean;
}

// 显示课程信息适用的视图
export type InfoView = 'single' | 'dualLeft' | 'dualRight' | 'plugin';

export interface Meta {
  school: string;
  term: string;
  startDate: string;
  daysPerWeek: number;
  nodesPerDay: number;
  totalWeeks: number;
  creditCap: number;
  willingBudget: number;
  weekComboColors?: boolean; // 双课表右侧候选：按星期组合区分颜色（默认开启）
  dividerNodes?: number[]; // 课表分割线：在第 N 节后画一条横线（用于分割上午/中午/下午）
  rowHeight?: number; // 课表每节行高（px），默认 52
  evenCardWidth?: boolean; // 双课表右侧：按每天最大重叠课程数均分卡片宽度（天列宽按比例分配）
  focusDimOpacity?: number; // 双课表右侧：点击某候选后，其它课程块的透明度（0~1，默认 0.5）
  // —— 显示偏好（持久化到存档，插件预览小课表复用同一套规则） ——
  viewMode?: 'single' | 'double'; // 单/双课表
  showEnrollment?: boolean; // 显示已选人数/容量
  showElectives?: boolean; // 显示非必修
  filterConflicts?: boolean; // 过滤冲突课程（双课表右侧/预览）
  hideSelectedCandidates?: boolean; // 已选中的课不再显示其它候选（默认开启）
  // 显示课程信息（教师/周次/地点）：按视图独立配置，缺省即整组默认
  infoConfig?: Partial<Record<InfoView, Partial<InfoBits>>>;
  // 不同候选信息叠加显示：总开关 + 显示教师 + 显示地点
  coInfo?: { enabled?: boolean; showTeacher?: boolean; showRoom?: boolean };
  // 周段优化显示：true=按「课程集合相同的周」合并分组，false=独立显示（连续周段拆开）
  optimizeWeeks?: boolean;
  // 一键生成可行课表：结果区最多展示的份数（默认 20）
  resultLimit?: number;
  // 教材信息页显示哪些列（缺省=显示；false=隐藏）
  textbookColumns?: Partial<Record<TextbookColumnKey, boolean>>;
}

// 教材信息页的列
export type TextbookColumnKey =
  | 'courseName'
  | 'courseCode'
  | 'type'
  | 'index'
  | 'name'
  | 'author'
  | 'isbn'
  | 'publisher'
  | 'edition'
  | 'pubDate';

// 目标清单：一条「需要完成选课」的记录。target 指向一个课程编号或一个串联组标识。
export type GoalTargetType = 'course' | 'link';

export interface Goal {
  id: string;
  name: string; // 显示名（默认取课程名 / 串联组名）
  target: string; // 课程编号 或 串联组标识（linkId）
  targetType: GoalTargetType;
}

// 教务「已选课程」页抓取结果：实际已完成选课操作的课程/教学班编号快照。
export interface ActualSelection {
  updatedAt: number; // 抓取时间戳（毫秒）
  lessonCodes: string[]; // 实际已选的教学班编号（option.label 精确匹配）
  courseCodes: string[]; // 实际已选的课程编号（无教学班编号时的兜底匹配）
}

// —— 通知：插件「更新课程数据 / 更新已选课程」产生的变动记录 ——
// 分类：enrolled=已选人数（右列）；capacity/time/room/teacher=人数上限/时间/地点/教师（左列）；
// summary=摘要（「更新已选课程」的整轮统计，全宽展示）。
export type NoticeKind = 'enrolled' | 'capacity' | 'time' | 'room' | 'teacher' | 'summary';

export interface NoticeItem {
  kind: NoticeKind;
  courseName: string; // 课程名（summary 可为空）
  label: string; // 教学班编号（summary 可为空）
  oldText: string; // 旧值（summary 为空）
  newText: string; // 新值（summary 为摘要文本）
}

// 一轮通知：一次「更新课程数据」或「更新已选课程」操作产生的全部变动，带时间戳。
export interface NoticeRound {
  id: string;
  at: number; // 时间戳（毫秒）
  source: 'courseData' | 'selectedCourses';
  items: NoticeItem[];
}

// —— 教材信息：插件「导出教材信息」抓取的每门课教材/参考书明细 ——
export interface TextbookRow {
  type: string; // 教材 / 参考书
  index: string; // 序号
  name: string; // 教材名称
  author: string; // 作者
  isbn: string; // ISBN/编号
  publisher: string; // 出版社
  edition: string; // 版次
  pubDate: string; // 出版年月
}

export interface TextbookEntry {
  courseCode: string;
  courseName: string;
  rows: TextbookRow[];
}

export interface Schedule {
  meta: Meta;
  nodeTimes: NodeTime[];
  teacherRatings: TeacherRating[];
  courses: Course[];
  goals?: Goal[]; // 目标清单（选课进度追踪）
  actualSelection?: ActualSelection; // 教务「已选课程」同步结果
  notices?: NoticeRound[]; // 插件更新产生的通知（持久化）
  textbooks?: TextbookEntry[]; // 插件「导出教材信息」抓取的教材明细（持久化）
}

export interface Settings {
  currentSaveId?: string; // 记忆：上次打开的存档
  port?: number; // 记忆：上次成功监听的端口（端口被占用自动切换后沿用）
}
