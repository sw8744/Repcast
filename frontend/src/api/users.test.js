import { getUsers, registerUser, sendReportsToAllUsers } from './users';

beforeEach(() => {
  process.env.REACT_APP_API_ADDR = 'http://localhost:8000/';
});

test('회원 등록 API 요청을 보내고 UID를 반환한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ uid: '1234567890abcdef' }),
  });

  await expect(registerUser({
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'member@example.com',
    plan: '3개월 이용권',
  })).resolves.toBe('1234567890abcdef');

  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/user/register', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      name: '홍길동',
      tel: '01012345678',
      email: 'member@example.com',
      expire: 3,
    }),
  }));
});

test('회원 목록 API 응답을 화면용 데이터로 변환한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      users: [{
        uid: 'member-1',
        name: '테스트',
        tel: '01012345678',
        email: 'test@test.com',
        join_date: '2099-07-24T10:00:00',
        expire_date: '2099-10-31T23:59:59',
        last_use: '2099-08-03T14:25:18',
      }],
    }),
  });

  await expect(getUsers()).resolves.toEqual([expect.objectContaining({
    id: 'member-1',
    name: '테스트',
    phone: '01012345678',
    email: 'test@test.com',
    plan: '3개월 이용권',
    startDate: '2099-07-24',
    lastUsed: '2099-08-03 14:25',
    status: '이용 중',
  })]);
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:8000/user');
});

test('API_ADDR가 없으면 설정 오류를 반환한다', async () => {
  delete process.env.REACT_APP_API_ADDR;

  await expect(registerUser({
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'member@example.com',
    plan: '3개월 이용권',
  })).rejects.toThrow('API_ADDR');
});

test('16바이트를 초과하는 UID를 거부한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ uid: '1234567890abcdef0' }),
  });

  await expect(registerUser({
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'member@example.com',
    plan: '3개월 이용권',
  })).rejects.toThrow('16바이트 제한');
});

test('지원하지 않는 이용권 개월 수를 거부한다', async () => {
  await expect(registerUser({
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'member@example.com',
    plan: '2개월 이용권',
  })).rejects.toThrow('이용권 개월 수');
});

test('010으로 시작하지 않는 전화번호를 거부한다', async () => {
  await expect(registerUser({
    name: '홍길동',
    phone: '011-1234-5678',
    email: 'member@example.com',
    plan: '3개월 이용권',
  })).rejects.toThrow('010으로 시작');
});

test('모든 회원 기록지 이메일 발송 API를 호출한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      status: 'partial',
      total: 3,
      sent: 2,
      failed: 1,
      failures: [{ uid: 'member-3', reason: '등록된 이메일 주소가 없습니다.' }],
    }),
  });

  await expect(sendReportsToAllUsers()).resolves.toEqual({
    status: 'partial',
    total: 3,
    sent: 2,
    failed: 1,
    failures: [{ uid: 'member-3', reason: '등록된 이메일 주소가 없습니다.' }],
  });
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:8000/report/email/all',
    { method: 'POST' },
  );
});

test('기록지 이메일 발송 오류 메시지를 전달한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: false,
    json: async () => ({ detail: 'Gmail 발송 설정이 완료되지 않았습니다.' }),
  });

  await expect(sendReportsToAllUsers()).rejects.toThrow('Gmail 발송 설정');
});
