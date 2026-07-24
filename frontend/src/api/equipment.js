const CATEGORY_LABELS = {
  'upper-chest': '상체 · 가슴',
  'upper-back': '상체 · 등',
  'upper-shoulder': '상체 · 어깨',
  'upper-arm': '상체 · 팔',
  lower: '하체',
  cardio: '유산소',
};

function getApiBaseUrl() {
  const apiAddress = process.env.REACT_APP_API_ADDR;
  if (!apiAddress) {
    throw new Error('루트 .env에 API_ADDR를 설정한 뒤 프런트엔드를 다시 실행해 주세요.');
  }
  return apiAddress.replace(/\/$/, '');
}

function formatLastUsed(lastUsed) {
  if (!lastUsed) return '이용 기록 없음';

  const [date, time = ''] = String(lastUsed).split('T');
  return time ? `${date} ${time.slice(0, 5)}` : date;
}

export async function getEquipment() {
  const response = await fetch(`${getApiBaseUrl()}/equipment`);
  if (!response.ok) {
    throw new Error('운동기구 목록을 불러오지 못했습니다.');
  }

  const body = await response.json();
  if (!Array.isArray(body.equipment)) {
    throw new Error('서버에서 유효한 운동기구 목록을 받지 못했습니다.');
  }

  return body.equipment.map((item) => ({
    id: String(item.id || ''),
    name: String(item.name || ''),
    category: String(item.category || ''),
    categoryLabel: CATEGORY_LABELS[item.category] || String(item.category || '미분류'),
    lastUsed: formatLastUsed(item.last_used),
    gym: String(item.gym || ''),
    status: Number(item.status) === 1 ? '운영 중' : '운영 중지',
  }));
}
