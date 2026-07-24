function getApiBaseUrl() {
  const apiAddress = process.env.REACT_APP_API_ADDR;
  if (!apiAddress) {
    throw new Error('루트 .env에 API_ADDR를 설정한 뒤 프런트엔드를 다시 실행해 주세요.');
  }
  return apiAddress.replace(/\/$/, '');
}

async function getErrorMessage(response, fallback) {
  try {
    const body = await response.json();
    return body.detail || fallback;
  } catch {
    return fallback;
  }
}

function getMembershipMonths(joinDate, expireDate) {
  const [joinYear, joinMonth] = joinDate.slice(0, 10).split('-').map(Number);
  const [expireYear, expireMonth] = expireDate.slice(0, 10).split('-').map(Number);
  return (expireYear * 12 + expireMonth) - (joinYear * 12 + joinMonth);
}

function getLocalDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLastUsed(lastUsed) {
  if (!lastUsed) return '이용 기록 없음';

  const [date, time = ''] = String(lastUsed).split('T');
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

export async function getUsers() {
  const response = await fetch(`${getApiBaseUrl()}/user`);
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, '회원 목록을 불러오지 못했습니다.'));
  }

  const body = await response.json();
  if (!Array.isArray(body.users)) {
    throw new Error('서버에서 유효한 회원 목록을 받지 못했습니다.');
  }

  const today = getLocalDateString();
  return body.users.map((user) => {
    const joinDate = String(user.join_date || '').slice(0, 10);
    const expireDate = String(user.expire_date || '').slice(0, 10);
    const months = joinDate && expireDate ? getMembershipMonths(joinDate, expireDate) : 0;

    return {
      id: String(user.uid || ''),
      name: String(user.name || ''),
      phone: String(user.tel || ''),
      email: String(user.email || ''),
      plan: months > 0 ? `${months}개월 이용권` : '이용권 정보 없음',
      startDate: joinDate,
      expireDate,
      lastUsed: formatLastUsed(user.last_use),
      status: expireDate >= today ? '이용 중' : '만료',
    };
  });
}

export async function registerUser({ name, phone, email, plan }) {
  const expire = Number.parseInt(plan, 10);
  const tel = phone.replace(/\D/g, '');
  if (![1, 3, 6, 12].includes(expire)) {
    throw new Error('유효한 이용권 개월 수를 선택해 주세요.');
  }
  if (!/^010\d{8}$/.test(tel)) {
    throw new Error('전화번호는 010으로 시작하는 11자리 번호여야 합니다.');
  }

  const response = await fetch(`${getApiBaseUrl()}/user/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: name.trim(),
      tel,
      email: email.trim(),
      expire,
    }),
  });

  if (!response.ok) {
    throw new Error(await getErrorMessage(response, '회원 등록 요청에 실패했습니다.'));
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

export async function sendReportsToAllUsers() {
  const response = await fetch(`${getApiBaseUrl()}/report/email/all`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(await getErrorMessage(response, '기록지 이메일 발송에 실패했습니다.'));
  }

  const body = await response.json();
  const total = Number(body.total);
  const sent = Number(body.sent);
  const failed = Number(body.failed);
  if (
    !Number.isInteger(total)
    || !Number.isInteger(sent)
    || !Number.isInteger(failed)
    || total < 0
    || sent < 0
    || failed < 0
    || sent + failed !== total
  ) {
    throw new Error('서버에서 유효한 이메일 발송 결과를 받지 못했습니다.');
  }

  return {
    status: String(body.status || ''),
    total,
    sent,
    failed,
    failures: Array.isArray(body.failures) ? body.failures : [],
  };
}
