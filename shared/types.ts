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
}

export interface Schedule {
  meta: Meta;
  nodeTimes: NodeTime[];
  teacherRatings: TeacherRating[];
  courses: Course[];
}

export interface Settings {
  currentSaveId?: string; // 记忆：上次打开的存档
}
