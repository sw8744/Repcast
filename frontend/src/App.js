import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BicepsFlexed,
  CalendarDays,
  Cable,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  LoaderCircle,
  Mail,
  Menu,
  MoreHorizontal,
  MoveUp,
  Phone,
  RefreshCw,
  Repeat2,
  Radio,
  Rows3,
  Search,
  UserCog,
  UserPlus,
  Users,
  Usb,
  X,
} from 'lucide-react';
import './App.css';
import { getEquipment } from './api/equipment';
import { formatDuration, getSessions } from './api/sessions';
import { getUsers, registerUser, sendReportsToAllUsers } from './api/users';
import {
  getArduinoErrorMessage,
  isRetryableArduinoError,
  RfidSerialClient,
} from './serial/rfidSerial';

const navigation = [
  { label: '대시보드', icon: LayoutDashboard, path: '/dashboard' },
  { label: '세션 기록', icon: CalendarDays, path: '/sessions' },
  { label: '회원 관리', icon: Users, path: '/members' },
  { label: '기구 관리', icon: Dumbbell, path: '/equipment' },
];

const equipmentCategoryIcons = {
  'upper-chest': HeartPulse,
  'upper-back': Rows3,
  'upper-shoulder': MoveUp,
  'upper-arm': BicepsFlexed,
  lower: Footprints,
  cardio: Activity,
};

const initialMembers = [];
const AUTO_RETRY_DELAY_MS = 800;

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function aggregateSessions(sessions, keySelector, valueSelector = () => 1) {
  const values = new Map();
  sessions.forEach((session) => {
    const key = keySelector(session);
    values.set(key, (values.get(key) || 0) + valueSelector(session));
  });
  return [...values.entries()].map(([label, value]) => ({ label, value }));
}

function buildDashboardData(sessions) {
  const todaySessions = sessions.filter((session) => session.date === getLocalDateKey());
  const totalDuration = todaySessions.reduce((sum, session) => sum + session.durationSeconds, 0);
  const totalSets = todaySessions.reduce((sum, session) => sum + session.sets, 0);
  const totalCount = todaySessions.reduce((sum, session) => sum + session.count, 0);
  const totalVolume = todaySessions.reduce((sum, session) => sum + session.volume, 0);

  const equipmentUsage = aggregateSessions(todaySessions, (session) => session.equipmentName)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);
  const memberVolumes = aggregateSessions(
    todaySessions,
    (session) => session.memberName,
    (session) => session.volume,
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((item, index) => ({ ...item, rank: index < 3 ? index + 1 : undefined }));
  const equipmentVolumes = aggregateSessions(
    todaySessions,
    (session) => session.equipmentName,
    (session) => session.volume,
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);
  const hourlySessions = aggregateSessions(
    todaySessions,
    (session) => `${session.startTime.slice(0, 2)}:00`,
  ).sort((a, b) => a.label.localeCompare(b.label));

  return {
    metrics: [
      { label: '총 세션 수', value: todaySessions.length.toLocaleString(), note: '오늘 기록된 세션 수', icon: Users, tone: 'blue' },
      { label: '총 운동 시간', value: formatDuration(totalDuration), note: '오늘 운동 시간 합계', icon: Clock3, tone: 'indigo' },
      { label: '총 세트 수', value: totalSets.toLocaleString(), note: '오늘 세트 수 합계', icon: Dumbbell, tone: 'blue' },
      { label: '총 반복 수', value: totalCount.toLocaleString(), note: '오늘 반복 수 합계', icon: Repeat2, tone: 'cyan' },
      { label: '총 운동 볼륨', value: totalVolume.toLocaleString(), suffix: 'kg', note: '오늘 운동 볼륨 합계', icon: Flame, tone: 'orange' },
    ],
    equipmentUsage,
    memberVolumes,
    equipmentVolumes,
    hourlySessions,
    recentSessions: sessions.slice(0, 5),
  };
}

function PanelTitle({ title, subtitle }) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title} <span className="info-dot" aria-label="정보">i</span></h2>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function VerticalChart({ data, color = 'blue', max = 4 }) {
  return (
    <div className={`vertical-chart ${color}`}>
      <div className="y-axis">
        {[max, max - 1, max - 2, max - 3, 0].map((tick) => <span key={tick}>{tick}</span>)}
      </div>
      <div className="plot">
        <div className="grid-lines" />
        {data.map((item) => (
          <div className="vertical-item" key={item.label}>
            <span className="bar-value">{item.value}</span>
            <div className="vertical-bar" style={{ height: `${(item.value / max) * 100}%` }} />
            <span className="vertical-label">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalChart({ data, color = 'teal', max = 2500, unit = 'kg', ranked = false }) {
  return (
    <div className={`horizontal-chart ${color}`}>
      {data.map((item) => (
        <div className="horizontal-row" key={item.label}>
          <span className="horizontal-label">
            {ranked && item.rank ? <Crown className={`rank rank-${item.rank}`} size={14} /> : null}
            {item.label}
          </span>
          <div className="horizontal-track">
            <div className="horizontal-bar" style={{ width: `${Math.min((item.value / max) * 100, 100)}%` }} />
          </div>
          <span className="horizontal-value">{item.value.toLocaleString()} {unit}</span>
        </div>
      ))}
      <div className="chart-scale" aria-hidden="true">
        <span>0</span><span>{(max / 2).toLocaleString()}</span><span>{max.toLocaleString()}</span>
      </div>
    </div>
  );
}

function MemberManagement({ members, memberListState, onAddMember }) {
  const serialClientRef = useRef(new RfidSerialClient());
  const retryControllerRef = useRef(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [reportEmailState, setReportEmailState] = useState({
    status: 'idle',
    message: '',
  });
  const [serialState, setSerialState] = useState(RfidSerialClient.isSupported() ? 'disconnected' : 'unsupported');
  const [workflow, setWorkflow] = useState({ stage: 'idle', message: 'Arduino를 연결하면 회원 등록을 시작할 수 있습니다.' });
  const [pendingUid, setPendingUid] = useState('');
  const [serialLog, setSerialLog] = useState([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    plan: '',
    startDate: '',
  });

  const isBusy = ['registering', 'write-mode', 'writing', 'read-mode', 'verifying', 'retrying'].includes(workflow.stage);

  const filteredMembers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) =>
      [member.name, member.phone, member.email]
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [members, searchTerm]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  useEffect(() => () => retryControllerRef.current?.abort(), []);

  const connectArduino = async () => {
    setSerialState('connecting');
    setWorkflow({ stage: 'idle', message: '연결할 Arduino Nano 포트를 선택해 주세요.' });

    try {
      await serialClientRef.current.connect((line) => {
        setSerialLog((current) => [...current.slice(-3), line]);
      });
      setSerialState('connected');
      setWorkflow({ stage: 'idle', message: 'Arduino가 연결되었습니다. 회원 정보를 입력해 주세요.' });
    } catch (error) {
      setSerialState('disconnected');
      setWorkflow({ stage: 'error', message: error.message });
    }
  };

  const expectArduino = async (promise) => {
    const line = await promise;
    if (line.startsWith('ERR,')) {
      const error = new Error(getArduinoErrorMessage(line));
      error.retryable = isRetryableArduinoError(line);
      throw error;
    }
    return line;
  };

  const programAndVerifyCard = async (uid, signal) => {
    const client = serialClientRef.current;
    const throwIfCancelled = () => {
      if (signal.aborted) {
        throw new DOMException('카드 등록이 취소되었습니다.', 'AbortError');
      }
    };

    throwIfCancelled();
    setWorkflow({ stage: 'write-mode', message: '쓰기 모드로 전환 중입니다. 카드를 리더기에서 떼어 주세요.' });
    await expectArduino(client.sendAndWait(
      `W,${uid}`,
      (line) => line === `OK,MODE,W,${uid}` || line.startsWith('ERR,'),
      5000,
      signal,
    ));

    throwIfCancelled();
    setWorkflow({ stage: 'writing', message: '카드를 리더기에 태그해 주세요. UID를 카드에 기록합니다.' });
    await expectArduino(client.waitFor(
      (line) => line === `OK,W,${uid}` || line.startsWith('ERR,'),
      undefined,
      signal,
    ));

    throwIfCancelled();
    setWorkflow({ stage: 'read-mode', message: '쓰기 성공. 읽기 모드로 전환 중입니다.' });
    await expectArduino(client.sendAndWait(
      'R',
      (line) => line === 'OK,MODE,R' || line.startsWith('ERR,'),
      5000,
      signal,
    ));

    throwIfCancelled();
    setWorkflow({ stage: 'verifying', message: '카드를 리더기에서 완전히 떼었다가 다시 태그해 주세요.' });
    const verifyLine = await expectArduino(client.waitFor(
      (line) => line.startsWith('OK,R,') || line.startsWith('ERR,'),
      undefined,
      signal,
    ));
    const readUid = verifyLine.slice('OK,R,'.length);
    if (readUid !== uid) {
      throw new Error(`카드 검증 실패: 기록한 UID(${uid})와 읽은 UID(${readUid})가 다릅니다.`);
    }
  };

  const finishRegistration = async (uid) => {
    retryControllerRef.current?.abort();
    const controller = new AbortController();
    retryControllerRef.current = controller;
    let retryCount = 0;

    try {
      while (!controller.signal.aborted) {
        try {
          await programAndVerifyCard(uid, controller.signal);
          const newMember = onAddMember({ ...form, uid });
          setForm({
            name: '',
            phone: '',
            email: '',
            plan: '',
            startDate: '',
          });
          setPendingUid('');
          setWorkflow({ stage: 'success', message: '카드 읽기 검증이 완료되었습니다.' });
          setSuccessMessage(`${newMember.name} 회원과 RFID 카드가 등록되었습니다.`);
          window.setTimeout(() => setSuccessMessage(''), 3000);
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!error.retryable) {
            setWorkflow({ stage: 'error', message: error.message });
            return;
          }

          retryCount += 1;
          setWorkflow({
            stage: 'retrying',
            message: `통신 오류가 발생했습니다. 카드를 떼었다 다시 태그해 주세요. 자동 재시도 중 (${retryCount}번째)`,
          });
          await new Promise((resolve) => {
            const timer = window.setTimeout(resolve, AUTO_RETRY_DELAY_MS);
            controller.signal.addEventListener('abort', () => {
              window.clearTimeout(timer);
              resolve();
            }, { once: true });
          });
        }
      }
    } finally {
      if (retryControllerRef.current === controller) {
        retryControllerRef.current = null;
      }
    }
  };

  const cancelCardRegistration = () => {
    if (!retryControllerRef.current) return;
    retryControllerRef.current.abort();
    setWorkflow({
      stage: 'cancelled',
      message: '카드 등록을 취소했습니다. 준비가 되면 카드 작업을 다시 시도해 주세요.',
    });
  };

  const submitMember = async (event) => {
    event.preventDefault();

    if (!serialClientRef.current.isConnected) {
      setWorkflow({ stage: 'error', message: '먼저 Arduino Nano를 연결해 주세요.' });
      return;
    }

    setWorkflow({ stage: 'registering', message: '백엔드에 회원 정보를 등록하고 UID를 발급받는 중입니다.' });
    try {
      const uid = await registerUser(form);
      setPendingUid(uid);
      await finishRegistration(uid);
    } catch (error) {
      setWorkflow({ stage: 'error', message: error.message });
    }
  };

  const sendAllReports = async () => {
    setReportEmailState({
      status: 'sending',
      message: '회원별 기록지를 생성해 Gmail로 발송하고 있습니다.',
    });
    try {
      const result = await sendReportsToAllUsers();
      setReportEmailState({
        status: result.failed ? 'warning' : 'success',
        message: result.failed
          ? `전체 ${result.total}명 중 ${result.sent}명에게 발송했고, ${result.failed}명은 실패했습니다.`
          : `전체 회원 ${result.sent}명에게 기록지를 발송했습니다.`,
      });
    } catch (error) {
      setReportEmailState({
        status: 'error',
        message: error.message,
      });
    }
  };

  return (
    <div className="members-page">
      {successMessage && (
        <div className="success-toast" role="status">
          <CheckCircle2 size={17} /> {successMessage}
        </div>
      )}

      <section className="member-layout">
        <article className="panel member-form-panel">
          <div className="form-title">
            <span className="form-title-icon"><UserPlus size={20} /></span>
            <div>
              <h3>신규 회원 등록</h3>
              <p>필수 정보를 입력한 후 회원을 추가하세요.</p>
            </div>
          </div>

          <form onSubmit={submitMember}>
            <label>
              회원 이름 <span>*</span>
              <input
                name="name"
                value={form.name}
                onChange={updateField}
                required
              />
            </label>

            <label>
              연락처 <span>*</span>
              <div className="input-with-icon">
                <Phone size={15} />
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={updateField}
                  required
                />
              </div>
            </label>

            <label>
              이메일 <span>*</span>
              <input
                name="email"
                type="email"
                value={form.email}
                onChange={updateField}
                required
              />
            </label>

            <div className="form-row">
              <label>
                이용권
                <select name="plan" value={form.plan} onChange={updateField} required>
                  <option value="" disabled>이용권 선택</option>
                  <option>1개월 이용권</option>
                  <option>3개월 이용권</option>
                  <option>6개월 이용권</option>
                  <option>12개월 이용권</option>
                </select>
              </label>
              <label>
                시작일
                <input name="startDate" type="date" value={form.startDate} onChange={updateField} required />
              </label>
            </div>

            <div className={`serial-panel ${serialState}`}>
              <div className="serial-heading">
                <span className="serial-icon"><Usb size={18} /></span>
                <div>
                  <strong>RFID Writer</strong>
                  <small>
                    {serialState === 'connected' && 'Arduino Nano 연결됨'}
                    {serialState === 'connecting' && '연결 중'}
                    {serialState === 'disconnected' && '연결 필요'}
                    {serialState === 'unsupported' && 'Web Serial 미지원'}
                  </small>
                </div>
                {serialState !== 'connected' && serialState !== 'unsupported' && (
                  <button type="button" onClick={connectArduino} disabled={serialState === 'connecting'}>
                    {serialState === 'connecting' ? <LoaderCircle className="spin" size={14} /> : <Cable size={14} />}
                    Arduino 연결
                  </button>
                )}
              </div>

              <div className={`workflow-message ${workflow.stage}`}>
                {isBusy ? <LoaderCircle className="spin" size={15} /> : workflow.stage === 'success' ? <CheckCircle2 size={15} /> : <Radio size={15} />}
                <span>{workflow.message}</span>
              </div>

              <div className="workflow-steps" aria-label="RFID 카드 등록 진행 상태">
                <span className={pendingUid || workflow.stage === 'success' ? 'done' : workflow.stage === 'registering' ? 'active' : ''}>1. UID 발급</span>
                <span className={['read-mode', 'verifying', 'success'].includes(workflow.stage) ? 'done' : ['write-mode', 'writing', 'retrying'].includes(workflow.stage) ? 'active' : ''}>2. 카드 쓰기</span>
                <span className={workflow.stage === 'success' ? 'done' : workflow.stage === 'verifying' ? 'active' : ''}>3. 읽기 검증</span>
              </div>

              {pendingUid && (
                <div className="workflow-actions">
                  {isBusy ? (
                    <button className="cancel-button" type="button" onClick={cancelCardRegistration}>
                      카드 등록 취소
                    </button>
                  ) : ['error', 'cancelled'].includes(workflow.stage) ? (
                    <button className="retry-button" type="button" onClick={() => finishRegistration(pendingUid)}>
                      RFID 카드 작업 다시 시도
                    </button>
                  ) : null}
                </div>
              )}

              {serialLog.length > 0 && (
                <div className="serial-log" aria-label="최근 Arduino 응답">
                  {serialLog.map((line, index) => <code key={`${line}-${index}`}>{line}</code>)}
                </div>
              )}
            </div>

            <button className="primary-button" type="submit" disabled={isBusy || Boolean(pendingUid) || serialState !== 'connected'}>
              {isBusy ? <LoaderCircle className="spin" size={16} /> : <UserPlus size={16} />}
              회원 등록 및 카드 발급
            </button>
          </form>
        </article>

        <article className="panel member-list-panel">
          <div className="member-list-header">
            <div className="member-list-title">
              <div>
                <h3>회원 목록</h3>
                <p>등록이 완료된 회원을 표시합니다.</p>
              </div>
              <button
                className="report-email-button"
                type="button"
                onClick={sendAllReports}
                disabled={
                  members.length === 0
                  || memberListState.loading
                  || reportEmailState.status === 'sending'
                }
              >
                {reportEmailState.status === 'sending'
                  ? <LoaderCircle className="spin" size={15} />
                  : <Mail size={15} />}
                {reportEmailState.status === 'sending'
                  ? '기록지 발송 중'
                  : '모든 회원 기록지 보내기'}
              </button>
            </div>
            <div className="member-summary">
              <span><strong>{members.length}</strong> 전체 회원</span>
              <span><strong>{members.filter((member) => member.status === '이용 중').length}</strong> 이용 중</span>
            </div>
            <label className="search-box">
              <Search size={15} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="이름 또는 연락처 검색"
                aria-label="회원 검색"
              />
            </label>
          </div>

          {reportEmailState.message && (
            <div
              className={`report-email-result ${reportEmailState.status}`}
              role={reportEmailState.status === 'error' ? 'alert' : 'status'}
            >
              {reportEmailState.status === 'sending'
                ? <LoaderCircle className="spin" size={15} />
                : reportEmailState.status === 'success'
                  ? <CheckCircle2 size={15} />
                  : <Mail size={15} />}
              <span>{reportEmailState.message}</span>
            </div>
          )}

          <div className="table-scroll member-table-scroll">
            <table className="member-table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>이용권</th>
                  <th>최근 이용</th>
                  <th>상태</th>
                  <th><span className="sr-only">관리</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <div className="member-identity">
                        <span>{member.name.slice(0, 1)}</span>
                        <div><strong>{member.name}</strong></div>
                      </div>
                    </td>
                    <td>
                      <div className="contact-details">
                        <strong>{member.phone}</strong>
                        <small>{member.email}</small>
                      </div>
                    </td>
                    <td><strong className="plan-name">{member.plan}</strong><small className="start-date">{member.startDate} 시작</small></td>
                    <td><span className="last-used">{member.lastUsed || '이용 기록 없음'}</span></td>
                    <td><span className={`status-pill ${member.status === '이용 중' ? 'active' : 'warning'}`}>{member.status}</span></td>
                    <td><button className="more-button" aria-label={`${member.name} 회원 관리`}><MoreHorizontal size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredMembers.length === 0 && (
              <div className="empty-search">
                {memberListState.loading && '회원 목록을 불러오는 중입니다.'}
                {!memberListState.loading && memberListState.error && memberListState.error}
                {!memberListState.loading && !memberListState.error && (
                  searchTerm.trim() ? '검색 결과가 없습니다.' : '등록된 회원이 없습니다.'
                )}
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}

function SessionHistory({ sessions, sessionListState }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [sessionPage, setSessionPage] = useState(1);
  const pageSize = 15;

  const filteredSessions = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesDate = !dateFilter || session.date === dateFilter;
      const matchesSearch = !keyword || [
        session.memberName,
        session.equipmentName,
        session.gymName,
      ].some((value) => value.toLowerCase().includes(keyword));
      return matchesDate && matchesSearch;
    });
  }, [dateFilter, searchTerm, sessions]);

  useEffect(() => {
    setSessionPage(1);
  }, [dateFilter, searchTerm]);

  const pageCount = Math.max(1, Math.ceil(filteredSessions.length / pageSize));
  const visibleSessions = filteredSessions.slice(
    (sessionPage - 1) * pageSize,
    sessionPage * pageSize,
  );
  const totalVolume = sessions.reduce((sum, session) => sum + session.volume, 0);
  const totalDuration = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);

  return (
    <div className="session-history-page">
      <section className="equipment-summary session-history-summary" aria-label="세션 기록 현황">
        <article>
          <span className="equipment-summary-icon"><CalendarDays size={20} /></span>
          <div><small>전체 세션</small><strong>{sessions.length.toLocaleString()}</strong></div>
        </article>
        <article>
          <span className="equipment-summary-icon active"><Clock3 size={20} /></span>
          <div><small>누적 운동 시간</small><strong>{formatDuration(totalDuration)}</strong></div>
        </article>
        <article>
          <span className="equipment-summary-icon used"><Flame size={20} /></span>
          <div><small>누적 운동 볼륨</small><strong>{totalVolume.toLocaleString()} kg</strong></div>
        </article>
      </section>

      <article className="panel session-history-panel">
        <div className="equipment-list-header session-history-header">
          <div>
            <h2>전체 세션 기록</h2>
            <p>회원별 운동 기구, 시간, 세트와 운동 볼륨을 확인합니다.</p>
          </div>
          <div className="session-history-controls">
            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              aria-label="세션 날짜 필터"
            />
            <label className="search-box equipment-search">
              <Search size={15} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="회원 또는 기구 검색"
                aria-label="세션 검색"
              />
            </label>
          </div>
        </div>

        <div className="table-scroll session-history-table-scroll">
          <table className="session-history-table">
            <thead>
              <tr>
                <th>날짜</th>
                <th>회원</th>
                <th>기구</th>
                <th>운동 시간</th>
                <th>세트</th>
                <th>반복</th>
                <th>중량</th>
                <th>볼륨</th>
              </tr>
            </thead>
            <tbody>
              {visibleSessions.map((session) => (
                <tr key={session.id}>
                  <td><strong>{session.date}</strong><small>{session.startTime}</small></td>
                  <td><strong>{session.memberName}</strong><small>{session.gymName}</small></td>
                  <td><strong>{session.equipmentName}</strong></td>
                  <td>{session.duration}</td>
                  <td>{session.sets.toLocaleString()}</td>
                  <td>{session.count.toLocaleString()}</td>
                  <td>{session.weight.toLocaleString()} kg</td>
                  <td><strong>{session.volume.toLocaleString()} kg</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleSessions.length === 0 && (
            <div className="empty-search">
              {sessionListState.loading && '세션 기록을 불러오는 중입니다.'}
              {!sessionListState.loading && sessionListState.error && sessionListState.error}
              {!sessionListState.loading && !sessionListState.error && (
                searchTerm.trim() || dateFilter
                  ? '조건에 맞는 세션 기록이 없습니다.'
                  : '등록된 세션 기록이 없습니다.'
              )}
            </div>
          )}
        </div>

        {filteredSessions.length > 0 && (
          <div className="pagination">
            <button
              disabled={sessionPage === 1}
              onClick={() => setSessionPage((current) => Math.max(1, current - 1))}
              aria-label="이전 세션 페이지"
            >
              <ChevronLeft size={14} />
            </button>
            <span><strong>{sessionPage}</strong> / {pageCount}</span>
            <button
              disabled={sessionPage === pageCount}
              onClick={() => setSessionPage((current) => Math.min(pageCount, current + 1))}
              aria-label="다음 세션 페이지"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </article>
    </div>
  );
}

function EquipmentManagement({ equipment, equipmentListState }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const categories = useMemo(
    () => [...new Map(equipment.map((item) => [item.category, item.categoryLabel])).entries()],
    [equipment],
  );
  const filteredEquipment = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return equipment.filter((item) => {
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesSearch = !keyword || [item.name, item.categoryLabel]
        .some((value) => value.toLowerCase().includes(keyword));
      return matchesCategory && matchesSearch;
    });
  }, [categoryFilter, equipment, searchTerm]);

  const activeCount = equipment.filter((item) => item.status === '운영 중').length;
  const usedCount = equipment.filter((item) => item.lastUsed !== '이용 기록 없음').length;

  return (
    <div className="equipment-page">
      <section className="equipment-summary" aria-label="운동기구 현황">
        <article>
          <span className="equipment-summary-icon"><Dumbbell size={20} /></span>
          <div><small>전체 기구</small><strong>{equipment.length}</strong></div>
        </article>
        <article>
          <span className="equipment-summary-icon active"><CheckCircle2 size={20} /></span>
          <div><small>운영 중</small><strong>{activeCount}</strong></div>
        </article>
        <article>
          <span className="equipment-summary-icon used"><Clock3 size={20} /></span>
          <div><small>이용 기록 있음</small><strong>{usedCount}</strong></div>
        </article>
      </section>

      <article className="panel equipment-list-panel">
        <div className="equipment-list-header">
          <div>
            <h2>운동기구 목록</h2>
            <p>등록된 기구의 분류, 최근 이용 시간과 운영 상태를 확인합니다.</p>
          </div>
          <div className="equipment-controls">
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              aria-label="기구 카테고리 필터"
            >
              <option value="all">전체 카테고리</option>
              {categories.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <label className="search-box equipment-search">
              <Search size={15} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="기구명 검색"
                aria-label="운동기구 검색"
              />
            </label>
          </div>
        </div>

        <div className="table-scroll equipment-table-scroll">
          <table className="equipment-table">
            <thead>
              <tr>
                <th>기구명</th>
                <th>카테고리</th>
                <th>최근 이용</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {filteredEquipment.map((item) => {
                const CategoryIcon = equipmentCategoryIcons[item.category] || Dumbbell;
                return (
                  <tr key={item.id}>
                    <td>
                      <div className="equipment-name">
                        <span
                          className={`equipment-category-icon ${item.category}`}
                          aria-label={`${item.categoryLabel} 아이콘`}
                        >
                          <CategoryIcon size={18} />
                        </span>
                        <strong>{item.name}</strong>
                      </div>
                    </td>
                    <td><span className={`category-pill ${item.category}`}>{item.categoryLabel}</span></td>
                    <td><span className="equipment-last-used">{item.lastUsed}</span></td>
                    <td>
                      <span className={`status-pill ${item.status === '운영 중' ? 'active' : 'warning'}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredEquipment.length === 0 && (
            <div className="empty-search">
              {equipmentListState.loading && '운동기구 목록을 불러오는 중입니다.'}
              {!equipmentListState.loading && equipmentListState.error && equipmentListState.error}
              {!equipmentListState.loading && !equipmentListState.error && (
                searchTerm.trim() || categoryFilter !== 'all'
                  ? '조건에 맞는 운동기구가 없습니다.'
                  : '등록된 운동기구가 없습니다.'
              )}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}

function PlaceholderPage({ title }) {
  return (
    <div className="placeholder-page panel">
      <Gauge size={28} />
      <h2>{title}</h2>
      <p>이 메뉴는 다음 작업에서 기능을 연결할 수 있도록 준비되어 있습니다.</p>
    </div>
  );
}

function App() {
  const getCurrentPath = () => {
    const path = window.location.pathname;
    return path === '/' ? '/dashboard' : path;
  };

  const [currentPath, setCurrentPath] = useState(getCurrentPath);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('14:30');
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState(initialMembers);
  const [memberListState, setMemberListState] = useState({ loading: false, error: '' });
  const [equipment, setEquipment] = useState([]);
  const [equipmentListState, setEquipmentListState] = useState({ loading: false, error: '' });
  const [sessions, setSessions] = useState([]);
  const [sessionListState, setSessionListState] = useState({ loading: false, error: '' });

  const activeItem = navigation.find((item) => item.path === currentPath) || navigation[0];
  const dashboardData = useMemo(() => buildDashboardData(sessions), [sessions]);

  useEffect(() => {
    if (window.location.pathname === '/') {
      window.history.replaceState({}, '', '/dashboard');
    }

    const handlePopState = () => setCurrentPath(getCurrentPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (currentPath !== '/members') return undefined;

    let active = true;
    setMemberListState({ loading: true, error: '' });
    getUsers()
      .then((users) => {
        if (!active) return;
        setMembers(users);
        setMemberListState({ loading: false, error: '' });
      })
      .catch((error) => {
        if (!active) return;
        setMemberListState({ loading: false, error: error.message });
      });

    return () => {
      active = false;
    };
  }, [currentPath]);

  useEffect(() => {
    if (currentPath !== '/equipment') return undefined;

    let active = true;
    setEquipmentListState({ loading: true, error: '' });
    getEquipment()
      .then((items) => {
        if (!active) return;
        setEquipment(items);
        setEquipmentListState({ loading: false, error: '' });
      })
      .catch((error) => {
        if (!active) return;
        setEquipmentListState({ loading: false, error: error.message });
      });

    return () => {
      active = false;
    };
  }, [currentPath]);

  useEffect(() => {
    if (!['/dashboard', '/sessions'].includes(currentPath)) return undefined;

    let active = true;
    setSessionListState({ loading: true, error: '' });
    getSessions()
      .then((items) => {
        if (!active) return;
        setSessions(items);
        setSessionListState({ loading: false, error: '' });
      })
      .catch((error) => {
        if (!active) return;
        setSessionListState({ loading: false, error: error.message });
      });

    return () => {
      active = false;
    };
  }, [currentPath]);

  const navigate = (path) => {
    if (path !== currentPath) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
    setSidebarOpen(false);
  };

  const addMember = (form) => {
    const member = {
      id: form.uid,
      name: form.name.trim(),
      phone: form.phone.replace(/\D/g, ''),
      email: form.email.trim(),
      plan: form.plan,
      startDate: form.startDate,
      lastUsed: '이용 기록 없음',
      status: '이용 중',
    };
    setMembers((current) => [member, ...current]);
    return member;
  };

  const refreshData = () => {
    setRefreshing(true);
    window.setTimeout(() => {
      setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }));
      setRefreshing(false);
    }, 650);
  };

  return (
    <div className="dashboard-shell">
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><Dumbbell size={19} /></span>
          <span>Rep<span>Cast</span></span>
        </div>
        <button className="sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기">
          <X size={20} />
        </button>

        <nav aria-label="주요 메뉴">
          {navigation.map(({ label, icon: Icon, path }) => (
            <button
              key={label}
              className={currentPath === path ? 'active' : ''}
              onClick={() => navigate(path)}
            >
              <Icon size={17} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-status">
          <span className="status-label">데이터 기준</span>
          <strong>{getLocalDateKey()} (오늘)</strong>
          <button onClick={refreshData} disabled={refreshing}>
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            {lastUpdated} 기준 새로고침
          </button>
        </div>
      </aside>

      {sidebarOpen && <button className="sidebar-overlay" onClick={() => setSidebarOpen(false)} aria-label="메뉴 닫기" />}

      <main className="main-content">
        <header className="topbar">
          <div className="title-wrap">
            <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="메뉴 열기">
              <Menu size={21} />
            </button>
            <div>
              <p>FITNESS OPERATIONS</p>
              <h1>{activeItem.label === '대시보드' ? 'RepCast 관리자 대시보드' : activeItem.label}</h1>
            </div>
          </div>
          <div className="topbar-tools">
            <button className="date-button"><CalendarDays size={15} /> {getLocalDateKey()} <span>(오늘)</span></button>
            <button className="profile-button">
              <span className="avatar"><UserCog size={18} /></span>
              <span><strong>관리자</strong><small>운영자</small></span>
              <ChevronDown size={14} />
            </button>
          </div>
        </header>

        <div className="dashboard-content">
          {currentPath === '/dashboard' && (
            <>
              {sessionListState.error && (
                <div className="data-error" role="alert">{sessionListState.error}</div>
              )}
              <section className="metrics-grid" aria-label="오늘의 주요 지표">
                {dashboardData.metrics.map(({ label, value, suffix, note, icon: Icon, tone }) => (
                  <article className="metric-card" key={label}>
                    <div className={`metric-icon ${tone}`}><Icon size={22} /></div>
                    <div>
                      <span className="metric-label">{label}</span>
                      <strong>{value}{suffix && <small> {suffix}</small>}</strong>
                      <p>{note}</p>
                    </div>
                  </article>
                ))}
              </section>

              <section className="dashboard-grid">
                <article className="panel">
                  <PanelTitle title="기구별 사용량" subtitle="각 기구에서 기록된 세션 수" />
                  <VerticalChart
                    data={dashboardData.equipmentUsage}
                    max={Math.max(4, ...dashboardData.equipmentUsage.map((item) => item.value))}
                  />
                </article>

                <article className="panel">
                  <PanelTitle title="회원별 총 볼륨 순위" subtitle="회원별 총 운동 볼륨 (kg)" />
                  <HorizontalChart
                    data={dashboardData.memberVolumes}
                    max={Math.max(1, ...dashboardData.memberVolumes.map((item) => item.value))}
                    ranked
                  />
                </article>

                <article className="panel">
                  <PanelTitle title="시간대별 세션 수" subtitle="시간대별 기록된 세션 수" />
                  <VerticalChart
                    data={dashboardData.hourlySessions}
                    color="purple"
                    max={Math.max(4, ...dashboardData.hourlySessions.map((item) => item.value))}
                  />
                </article>

                <article className="panel">
                  <PanelTitle title="기구별 총 볼륨" subtitle="각 기구에서 발생한 총 운동 볼륨" />
                  <HorizontalChart
                    data={dashboardData.equipmentVolumes}
                    color="blue"
                    max={Math.max(1, ...dashboardData.equipmentVolumes.map((item) => item.value))}
                  />
                </article>
              </section>

              <section className="panel sessions-panel">
                <div className="table-header">
                  <PanelTitle title="상세 운동 기록" subtitle="최근 기록된 운동 세션 목록" />
                  <button className="view-all" onClick={() => navigate('/sessions')}>
                    전체 보기 <ChevronRight size={14} />
                  </button>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {['회원명', '시작 시간', '종료 시간', '운동 시간', '기구', '세트', '반복', '볼륨 (kg)'].map((heading) => (
                          <th key={heading}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardData.recentSessions.map((session) => (
                        <tr key={session.id}>
                          <td>{session.memberName}</td>
                          <td>{session.startTime}</td>
                          <td>{session.finishTime}</td>
                          <td>{session.duration}</td>
                          <td>{session.equipmentName}</td>
                          <td>{session.sets.toLocaleString()}</td>
                          <td>{session.count.toLocaleString()}</td>
                          <td>{session.volume.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {currentPath === '/sessions' && (
            <SessionHistory sessions={sessions} sessionListState={sessionListState} />
          )}

          {currentPath === '/members' && (
            <MemberManagement
              members={members}
              memberListState={memberListState}
              onAddMember={addMember}
            />
          )}

          {currentPath === '/equipment' && (
            <EquipmentManagement
              equipment={equipment}
              equipmentListState={equipmentListState}
            />
          )}

          {!['/dashboard', '/sessions', '/members', '/equipment'].includes(currentPath) && (
            <PlaceholderPage title={activeItem.label} />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
