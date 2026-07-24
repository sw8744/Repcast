const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || '').replace(/\/$/, '');

export async function registerUser({ name, phone, email }) {
  const response = await fetch(`${API_BASE_URL}/user/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.trim(),
      tel: Number(phone.replace(/\D/g, '')),
      email: email.trim(),
    }),
  });

  if (!response.ok) {
    let message = '회원 등록 요청에 실패했습니다.';
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch {
      // JSON 오류 응답이 아니면 기본 메시지를 사용한다.
    }
    throw new Error(message);
  }

  const body = await response.json();
  if (!body.uid || typeof body.uid !== 'string') {
    throw new Error('서버에서 유효한 UID를 받지 못했습니다.');
  }
  if (!/^[\x20-\x7E]+$/.test(body.uid)) {
    throw new Error('서버 UID는 ASCII 문자로만 구성되어야 합니다.');
  }
  if (body.uid.length > 16) {
    throw new Error('서버 UID가 카드의 16바이트 제한을 초과했습니다.');
  }

  return body.uid;
}
