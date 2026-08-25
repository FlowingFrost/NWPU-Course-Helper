import type { NoticeItem, NoticeKind, Schedule } from '../../shared/types';
import { PanelWindow } from './PanelWindow';

const KIND_LABEL: Record<NoticeKind, string> = {
  enrolled: '已选人数',
  capacity: '人数上限',
  time: '时间',
  room: '地点',
  teacher: '教师',
  summary: '摘要',
};

// 左列：人数上限 / 时间 / 地点 / 教师；右列：已选人数
const LEFT_KINDS: NoticeKind[] = ['capacity', 'time', 'room', 'teacher'];

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function ItemRow({ item }: { item: NoticeItem }) {
  if (item.kind === 'summary') {
    return <div className="notice-item notice-summary">{item.newText}</div>;
  }
  const name = item.courseName || '(未命名)';
  const label = item.label ? `（${item.label}）` : '';
  return (
    <div className="notice-item">
      <span className="notice-kind">{KIND_LABEL[item.kind]}</span>
      <span className="notice-course">
        {name}
        {label}
      </span>
      <span className="notice-arrow">：</span>
      <span className="notice-old">{item.oldText || '无'}</span>
      <span className="notice-arrow">→</span>
      <span className="notice-new">{item.newText || '无'}</span>
    </div>
  );
}

// 通知区域：左右两栏（左=人数上限/时间/地点/教师，右=已选人数），每轮之间用分割线隔开。
export default function NotificationsPanel({
  schedule,
  update,
  onClose,
}: {
  schedule: Schedule;
  update: (fn: (s: Schedule) => Schedule) => void;
  onClose: () => void;
}) {
  const rounds = (schedule.notices ?? []).slice().reverse(); // 最新在前

  return (
    <PanelWindow title="通知" onClose={onClose} className="notices-panel">
      <div className="notices-body">
        <div className="notices-toolbar">
          <span className="muted">共 {rounds.length} 轮通知</span>
          {rounds.length > 0 && (
            <button className="notices-clear" onClick={() => update((s) => ({ ...s, notices: [] }))}>
              清空
            </button>
          )}
        </div>

        {rounds.length === 0 ? (
          <div className="muted empty">
            暂无通知。在教务页使用插件「更新课程数据 / 更新已选课程」后，课程变动会记录在这里。
          </div>
        ) : (
          rounds.map((r) => {
            const leftItems = r.items.filter((i) => LEFT_KINDS.includes(i.kind));
            const rightItems = r.items.filter((i) => i.kind === 'enrolled');
            const summaryItems = r.items.filter((i) => i.kind === 'summary');
            return (
              <div key={r.id} className="notice-round">
                <div className="notice-round-head">
                  <span className="notice-time">{formatTime(r.at)}</span>
                  <span className={`notice-source ${r.source}`}>
                    {r.source === 'courseData' ? '更新课程数据' : '更新已选课程'}
                  </span>
                </div>

                {(leftItems.length > 0 || rightItems.length > 0) && (
                  <div className="notice-cols">
                    <div className="notice-col notice-left">
                      <div className="notice-col-head">人数上限 / 时间 / 地点 / 教师</div>
                      {leftItems.length ? (
                        leftItems.map((it, i) => <ItemRow key={i} item={it} />)
                      ) : (
                        <div className="muted notice-empty">无</div>
                      )}
                    </div>
                    <div className="notice-col notice-right">
                      <div className="notice-col-head">已选人数</div>
                      {rightItems.length ? (
                        rightItems.map((it, i) => <ItemRow key={i} item={it} />)
                      ) : (
                        <div className="muted notice-empty">无</div>
                      )}
                    </div>
                  </div>
                )}

                {summaryItems.length > 0 && (
                  <div className="notice-summaries">
                    {summaryItems.map((it, i) => (
                      <ItemRow key={i} item={it} />
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </PanelWindow>
  );
}
