import { formatDuration, getSessions } from './sessions';

beforeEach(() => {
  process.env.REACT_APP_API_ADDR = 'http://localhost:8000/';
});

test('세션 API 응답을 대시보드용 데이터로 변환한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      sessions: [{
        sid: 'session-1',
        uid: 'user-1',
        user_name: '김민준',
        gym: 'gym-1',
        gym_name: 'Repcast 건국대점',
        equipment: 'equipment-1',
        equipment_name: '체스트 프레스',
        category: 'upper-chest',
        count: 36,
        set: 3,
        start: '2026-07-24T10:00:00',
        finish: '2026-07-24T10:14:30',
        weight: 40,
      }],
    }),
  });

  await expect(getSessions()).resolves.toEqual([expect.objectContaining({
    id: 'session-1',
    memberName: '김민준',
    equipmentName: '체스트 프레스',
    date: '2026-07-24',
    duration: '00:14:30',
    count: 36,
    sets: 3,
    volume: 1440,
  })]);
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/session');
});

test('초 단위 운동 시간을 시:분:초로 표시한다', () => {
  expect(formatDuration(3661)).toBe('01:01:01');
});
