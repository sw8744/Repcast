import { registerUser } from './users';

test('회원 등록 API 요청을 보내고 UID를 반환한다', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ uid: '1234567890abcdef' }),
  });

  await expect(registerUser({
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'member@example.com',
  })).resolves.toBe('1234567890abcdef');

  expect(global.fetch).toHaveBeenCalledWith('/user/register', expect.objectContaining({
    method: 'POST',
    body: JSON.stringify({
      name: '홍길동',
      tel: 1012345678,
      email: 'member@example.com',
    }),
  }));
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
  })).rejects.toThrow('16바이트 제한');
});
