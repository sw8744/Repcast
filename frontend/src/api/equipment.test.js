import { getEquipment } from './equipment';

beforeEach(() => {
  process.env.REACT_APP_API_ADDR = 'http://localhost:8000/';
});

test('운동기구 목록 API 응답을 화면용 데이터로 변환한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      equipment: [{
        id: 'equipment-1',
        name: '숄더 프레스',
        category: 'upper-shoulder',
        last_used: '2026-07-23T11:42:00',
        gym: 'gym-1',
        status: 1,
      }],
    }),
  });

  await expect(getEquipment()).resolves.toEqual([{
    id: 'equipment-1',
    name: '숄더 프레스',
    category: 'upper-shoulder',
    categoryLabel: '상체 · 어깨',
    lastUsed: '2026-07-23 11:42',
    gym: 'gym-1',
    status: '운영 중',
  }]);
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/equipment');
});

test('최근 사용 기록이 없으면 안내 문구를 표시한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      equipment: [{
        id: 'equipment-2',
        name: '트레드밀',
        category: 'cardio',
        last_used: null,
        gym: 'gym-1',
        status: 0,
      }],
    }),
  });

  await expect(getEquipment()).resolves.toEqual([
    expect.objectContaining({
      lastUsed: '이용 기록 없음',
      status: '운영 중지',
    }),
  ]);
});
