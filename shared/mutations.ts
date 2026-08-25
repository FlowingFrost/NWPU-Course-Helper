import type { Schedule, Course, Option, Segment, Category } from './types';

export function uid(prefix = 'id'): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

function mapCourses(s: Schedule, fn: (c: Course) => Course): Schedule {
  return { ...s, courses: s.courses.map(fn) };
}

export function emptyOption(): Option {
  return { id: uid('opt'), label: '', rating: 0, selected: false, enrolled: 0, capacity: 0, segments: [] };
}

export function emptySegment(): Segment {
  return { day: 1, startNode: 1, step: 1, startWeek: 1, endWeek: 1, room: '', teacher: '' };
}

export function addCourse(s: Schedule, partial: Partial<Course> & { name: string; category: Category }): Schedule {
  const course: Course = {
    id: uid('crs'),
    code: '',
    credit: 0,
    willingOverride: null,
    color: '#64748b',
    options: [],
    ...partial,
  };
  course.options.push({ ...emptyOption(), selected: course.category === 'builtin' });
  return { ...s, courses: [...s.courses, course] };
}

export function updateCourse(s: Schedule, courseId: string, patch: Partial<Course>): Schedule {
  return mapCourses(s, (c) => (c.id === courseId ? { ...c, ...patch } : c));
}

export function deleteCourse(s: Schedule, courseId: string): Schedule {
  return { ...s, courses: s.courses.filter((c) => c.id !== courseId) };
}

export function setCategory(s: Schedule, courseId: string, category: Category): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    if (category === 'builtin') {
      const first = c.options[0] ?? emptyOption();
      return { ...c, category, options: [{ ...first, selected: true }] };
    }
    return { ...c, category };
  });
}

export function addOption(s: Schedule, courseId: string): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    return { ...c, options: [...c.options, emptyOption()] };
  });
}

export function updateOption(s: Schedule, courseId: string, optionId: string, patch: Partial<Option>): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    return { ...c, options: c.options.map((o) => (o.id === optionId ? { ...o, ...patch } : o)) };
  });
}

export function removeOption(s: Schedule, courseId: string, optionId: string): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    return { ...c, options: c.options.filter((o) => o.id !== optionId) };
  });
}

// 明确设置某候选的「确认选」；确认时会取消同级其他候选
export function setSelected(s: Schedule, courseId: string, optionId: string, selected: boolean): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    return {
      ...c,
      options: c.options.map((o) => ({ ...o, selected: o.id === optionId ? selected : selected ? false : o.selected })),
    };
  });
}

export function toggleSelected(s: Schedule, courseId: string, optionId: string): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    const target = c.options.find((o) => o.id === optionId);
    if (!target) return c;
    const next = !target.selected;
    return { ...c, options: c.options.map((o) => ({ ...o, selected: o.id === optionId ? next : false })) };
  });
}

export function addSegment(s: Schedule, courseId: string, optionId: string, seg: Segment): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    return { ...c, options: c.options.map((o) => (o.id === optionId ? { ...o, segments: [...o.segments, seg] } : o)) };
  });
}

export function updateSegment(s: Schedule, courseId: string, optionId: string, index: number, patch: Partial<Segment>): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    return {
      ...c,
      options: c.options.map((o) => {
        if (o.id !== optionId) return o;
        return { ...o, segments: o.segments.map((seg, i) => (i === index ? { ...seg, ...patch } : seg)) };
      }),
    };
  });
}

export function removeSegment(s: Schedule, courseId: string, optionId: string, index: number): Schedule {
  return mapCourses(s, (c) => {
    if (c.id !== courseId) return c;
    return {
      ...c,
      options: c.options.map((o) => (o.id === optionId ? { ...o, segments: o.segments.filter((_, i) => i !== index) } : o)),
    };
  });
}
