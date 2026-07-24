function getApiBaseUrl() {
  const apiAddress = process.env.REACT_APP_API_ADDR;
  if (!apiAddress) {
    throw new Error('루트 .env에 API_ADDR를 설정한 뒤 프런트엔드를 다시 실행해 주세요.');
  }
  return apiAddress.replace(/\/$/, '');
}

export function formatDuration(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

export async function getSessions() {
  const response = await fetch(`${getApiBaseUrl()}/session`);
  if (!response.ok) {
    throw new Error('세션 기록을 불러오지 못했습니다.');
  }

  const body = await response.json();
  if (!Array.isArray(body.sessions)) {
    throw new Error('서버에서 유효한 세션 기록을 받지 못했습니다.');
  }

  return body.sessions.map((session) => {
    const start = String(session.start || '');
    const finish = String(session.finish || '');
    const startDate = new Date(start);
    const finishDate = finish ? new Date(finish) : null;
    const durationSeconds = finishDate && !Number.isNaN(startDate.getTime())
      ? Math.max(0, Math.floor((finishDate.getTime() - startDate.getTime()) / 1000))
      : 0;
    const count = Number(session.count) || 0;
    const sets = Number(session.set) || 0;
    const weight = Number(session.weight) || 0;

    return {
      id: String(session.sid || ''),
      uid: String(session.uid || ''),
      memberName: String(session.user_name || '알 수 없는 회원'),
      gymId: String(session.gym || ''),
      gymName: String(session.gym_name || '알 수 없는 지점'),
      equipmentId: String(session.equipment || ''),
      equipmentName: String(session.equipment_name || '알 수 없는 기구'),
      category: String(session.category || ''),
      count,
      sets,
      weight,
      volume: count * weight,
      start,
      finish,
      date: start.slice(0, 10),
      startTime: start.slice(11, 19),
      finishTime: finish ? finish.slice(11, 19) : '진행 중',
      durationSeconds,
      duration: formatDuration(durationSeconds),
    };
  });
}
