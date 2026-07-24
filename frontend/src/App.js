import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
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
  Gauge,
  LayoutDashboard,
  LoaderCircle,
  Menu,
  MoreHorizontal,
  Phone,
  RefreshCw,
  Repeat2,
  Radio,
  Search,
  Settings,
  UserCog,
  UserPlus,
  Users,
  Usb,
  X,
} from 'lucide-react';
import './App.css';
import { registerUser } from './api/users';
import { RfidSerialClient } from './serial/rfidSerial';

const navigation = [
  { label: '대시보드', icon: LayoutDashboard, path: '/dashboard' },
  { label: '세션 기록', icon: CalendarDays, path: '/sessions' },
  { label: '회원 관리', icon: Users, path: '/members' },
  { label: '기구 관리', icon: Dumbbell, path: '/equipment' },
  { label: '통계 분석', icon: BarChart3, path: '/analytics' },
  { label: '설정', icon: Settings, path: '/settings' },
];

const initialMembers = [
  { id: 'RC-1028', name: '김소연', phone: '010-2384-1028', plan: '12개월 이용권', startDate: '2026-01-12', cardId: 'A4 12 8F 39', status: '이용 중' },
  { id: 'RC-1027', name: '박태호', phone: '010-5821-9930', plan: '6개월 이용권', startDate: '2026-03-05', cardId: '7B 90 1C 22', status: '이용 중' },
  { id: 'RC-1026', name: '이유나', phone: '010-4462-7015', plan: '3개월 이용권', startDate: '2026-05-18', cardId: '32 DF 4A 11', status: '이용 중' },
  { id: 'RC-1025', name: '최승민', phone: '010-7715-2046', plan: '1개월 이용권', startDate: '2026-06-24', cardId: 'C9 20 77 A3', status: '만료 예정' },
  { id: 'RC-1024', name: '정지영', phone: '010-9157-3308', plan: '12개월 이용권', startDate: '2025-11-02', cardId: '18 6E 54 B0', status: '이용 중' },
];

const metrics = [
  { label: '총 세션 수', value: '15', note: '오늘 기록된 세션 수', icon: Users, tone: 'blue' },
  { label: '총 운동 시간', value: '04:01:00', note: '전체 운동 시간 합계', icon: Clock3, tone: 'indigo' },
  { label: '총 세트 수', value: '51', note: '전체 세트 수 합계', icon: Dumbbell, tone: 'blue' },
  { label: '총 반복 수', value: '534', note: '전체 반복 수 합계', icon: Repeat2, tone: 'cyan' },
  { label: '총 운동 볼륨', value: '20,150', suffix: 'kg', note: '전체 볼륨 합계', icon: Flame, tone: 'orange' },
];

const equipmentUsage = [
  { label: 'LAT PULL', value: 3 },
  { label: 'LEG PRESS', value: 2 },
  { label: 'CHEST PRESS', value: 2 },
  { label: 'SEATED ROW', value: 2 },
  { label: 'LEG EXT', value: 2 },
  { label: 'SHOULDER PRESS', value: 1 },
  { label: 'CABLE ROW', value: 2 },
  { label: 'PULLDOWN', value: 1 },
  { label: 'PEC DECK', value: 1 },
  { label: 'SMITH SQUAT', value: 1 },
];

const hourlySessions = [
  { label: '06:00', value: 1 },
  { label: '07:00', value: 3 },
  { label: '08:00', value: 3 },
  { label: '09:00', value: 3 },
  { label: '10:00', value: 2 },
  { label: '11:00', value: 2 },
];

const memberVolumes = [
  { label: 'SOYEON', value: 2100, rank: 1 },
  { label: 'TAEHO', value: 2000, rank: 2 },
  { label: 'YUNA', value: 1800, rank: 3 },
  { label: 'SEUNGMIN', value: 1650 },
  { label: 'SUNGHO', value: 1500 },
];

const equipmentVolumes = [
  { label: 'LEG PRESS', value: 4100 },
  { label: 'CHEST PRESS', value: 2940 },
  { label: 'SMITH SQUAT', value: 1800 },
  { label: 'PULLDOWN', value: 1650 },
  { label: 'SHOULDER PRESS', value: 2160 },
];

const sessionRows = [
  ['JIYOUNG', '06:45', '06:59', '00:14', 'LAT PULL', '3', '36', '1,440'],
  ['MINJUN', '07:05', '07:22', '00:17', 'LEG EXT', '3', '40', '1,200'],
  ['HYEJIN', '07:25', '07:42', '00:17', 'SEATED ROW', '3', '36', '1,260'],
  ['DONGHYUN', '07:45', '08:02', '00:17', 'CHEST PRESS', '4', '35', '1,440'],
  ['SOYEON', '08:05', '08:19', '00:14', 'LEG PRESS', '4', '40', '2,100'],
];

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

function MemberManagement({ members, onAddMember }) {
  const serialClientRef = useRef(new RfidSerialClient());
  const [searchTerm, setSearchTerm] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [serialState, setSerialState] = useState(RfidSerialClient.isSupported() ? 'disconnected' : 'unsupported');
  const [workflow, setWorkflow] = useState({ stage: 'idle', message: 'Arduino를 연결하면 회원 등록을 시작할 수 있습니다.' });
  const [pendingUid, setPendingUid] = useState('');
  const [serialLog, setSerialLog] = useState([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    plan: '3개월 이용권',
    startDate: '2026-07-24',
  });

  const isBusy = ['registering', 'write-mode', 'writing', 'read-mode', 'verifying'].includes(workflow.stage);

  const filteredMembers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return members;
    return members.filter((member) =>
      [member.name, member.phone, member.id, member.cardId]
        .some((value) => value.toLowerCase().includes(keyword))
    );
  }, [members, searchTerm]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

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
      throw new Error(`Arduino 오류: ${line}`);
    }
    return line;
  };

  const programAndVerifyCard = async (uid) => {
    const client = serialClientRef.current;

    setWorkflow({ stage: 'write-mode', message: '쓰기 모드로 전환 중입니다. 카드를 리더기에서 떼어 주세요.' });
    await expectArduino(client.sendAndWait(
      `W,${uid}`,
      (line) => line === `OK,MODE,W,${uid}` || line.startsWith('ERR,'),
    ));

    setWorkflow({ stage: 'writing', message: '카드를 리더기에 태그해 주세요. UID를 카드에 기록합니다.' });
    await expectArduino(client.waitFor(
      (line) => line === `OK,W,${uid}` || line.startsWith('ERR,'),
    ));

    setWorkflow({ stage: 'read-mode', message: '쓰기 성공. 읽기 모드로 전환 중입니다.' });
    await expectArduino(client.sendAndWait(
      'R',
      (line) => line === 'OK,MODE,R' || line.startsWith('ERR,'),
    ));

    setWorkflow({ stage: 'verifying', message: '카드를 리더기에서 완전히 떼었다가 다시 태그해 주세요.' });
    const verifyLine = await expectArduino(client.waitFor(
      (line) => line.startsWith('OK,R,') || line.startsWith('ERR,'),
    ));
    const readUid = verifyLine.slice('OK,R,'.length);
    if (readUid !== uid) {
      throw new Error(`카드 검증 실패: 기록한 UID(${uid})와 읽은 UID(${readUid})가 다릅니다.`);
    }
  };

  const finishRegistration = async (uid) => {
    try {
      await programAndVerifyCard(uid);
      const newMember = onAddMember({ ...form, uid });
      setForm({
        name: '',
        phone: '',
        email: '',
        plan: '3개월 이용권',
        startDate: '2026-07-24',
      });
      setPendingUid('');
      setWorkflow({ stage: 'success', message: `카드 검증 완료: ${uid}` });
      setSuccessMessage(`${newMember.name} 회원과 RFID 카드가 등록되었습니다.`);
      window.setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setWorkflow({ stage: 'error', message: error.message });
    }
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

  return (
    <div className="members-page">
      <div className="page-heading-row">
        <div>
          <span className="eyebrow">MEMBER DIRECTORY</span>
          <h2>회원 관리</h2>
          <p>회원 정보와 RFID 카드를 등록하고 이용 상태를 관리합니다.</p>
        </div>
        <div className="member-summary">
          <span><strong>{members.length}</strong> 전체 회원</span>
          <span><strong>{members.filter((member) => member.status === '이용 중').length}</strong> 이용 중</span>
        </div>
      </div>

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
                placeholder="예: 홍길동"
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
                  placeholder="010-0000-0000"
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
                placeholder="member@example.com"
                required
              />
            </label>

            <div className="form-row">
              <label>
                이용권
                <select name="plan" value={form.plan} onChange={updateField}>
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
                <span className={['read-mode', 'verifying', 'success'].includes(workflow.stage) ? 'done' : ['write-mode', 'writing'].includes(workflow.stage) ? 'active' : ''}>2. 카드 쓰기</span>
                <span className={workflow.stage === 'success' ? 'done' : workflow.stage === 'verifying' ? 'active' : ''}>3. 읽기 검증</span>
              </div>

              {pendingUid && workflow.stage === 'error' && (
                <button className="retry-button" type="button" onClick={() => finishRegistration(pendingUid)}>
                  RFID 카드 작업 다시 시도
                </button>
              )}

              {serialLog.length > 0 && (
                <div className="serial-log" aria-label="최근 Arduino 응답">
                  {serialLog.map((line, index) => <code key={`${line}-${index}`}>{line}</code>)}
                </div>
              )}
            </div>

            <button className="primary-button" type="submit" disabled={isBusy || serialState !== 'connected'}>
              {isBusy ? <LoaderCircle className="spin" size={16} /> : <UserPlus size={16} />}
              회원 등록 및 카드 발급
            </button>
          </form>
        </article>

        <article className="panel member-list-panel">
          <div className="member-list-header">
            <div>
              <h3>회원 목록</h3>
              <p>최근 등록된 회원부터 표시됩니다.</p>
            </div>
            <label className="search-box">
              <Search size={15} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="이름, 연락처, 카드 검색"
                aria-label="회원 검색"
              />
            </label>
          </div>

          <div className="table-scroll member-table-scroll">
            <table className="member-table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>연락처</th>
                  <th>이용권</th>
                  <th>RFID 카드</th>
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
                        <div><strong>{member.name}</strong><small>{member.id}</small></div>
                      </div>
                    </td>
                    <td>{member.phone}</td>
                    <td><strong className="plan-name">{member.plan}</strong><small className="start-date">{member.startDate} 시작</small></td>
                    <td><span className={`card-chip ${member.cardId ? '' : 'empty'}`}>{member.cardId || '미등록'}</span></td>
                    <td><span className={`status-pill ${member.status === '이용 중' ? 'active' : 'warning'}`}>{member.status}</span></td>
                    <td><button className="more-button" aria-label={`${member.name} 회원 관리`}><MoreHorizontal size={17} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredMembers.length === 0 && <div className="empty-search">검색 결과가 없습니다.</div>}
          </div>
        </article>
      </section>
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
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState('14:30');
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState(initialMembers);

  const activeItem = navigation.find((item) => item.path === currentPath) || navigation[0];

  useEffect(() => {
    if (window.location.pathname === '/') {
      window.history.replaceState({}, '', '/dashboard');
    }

    const handlePopState = () => setCurrentPath(getCurrentPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

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
      phone: form.phone.trim(),
      plan: form.plan,
      startDate: form.startDate,
      cardId: form.uid,
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
          <strong>2026-07-24 (오늘)</strong>
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
            <button className="date-button"><CalendarDays size={15} /> 2026-07-24 <span>(오늘)</span></button>
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
              <section className="metrics-grid" aria-label="오늘의 주요 지표">
                {metrics.map(({ label, value, suffix, note, icon: Icon, tone }) => (
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
                  <VerticalChart data={equipmentUsage} max={4} />
                </article>

                <article className="panel">
                  <PanelTitle title="회원별 총 볼륨 순위" subtitle="회원별 총 운동 볼륨 (kg)" />
                  <HorizontalChart data={memberVolumes} max={2300} ranked />
                </article>

                <article className="panel">
                  <PanelTitle title="시간대별 세션 수" subtitle="시간대별 기록된 세션 수" />
                  <VerticalChart data={hourlySessions} color="purple" max={4} />
                </article>

                <article className="panel">
                  <PanelTitle title="기구별 총 볼륨" subtitle="각 기구에서 발생한 총 운동 볼륨" />
                  <HorizontalChart data={equipmentVolumes} color="blue" max={4500} />
                </article>
              </section>

              <section className="panel sessions-panel">
                <div className="table-header">
                  <PanelTitle title="상세 운동 기록" subtitle="최근 기록된 운동 세션 목록" />
                  <button className="view-all">전체 보기 <ChevronRight size={14} /></button>
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
                      {sessionRows.map((row) => (
                        <tr key={`${row[0]}-${row[1]}`}>
                          {row.map((cell, index) => <td key={`${cell}-${index}`}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pagination">
                  <button disabled={page === 1} onClick={() => setPage(Math.max(1, page - 1))} aria-label="이전 페이지">
                    <ChevronLeft size={14} />
                  </button>
                  <span><strong>{page}</strong> / 3</span>
                  <button disabled={page === 3} onClick={() => setPage(Math.min(3, page + 1))} aria-label="다음 페이지">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </section>
            </>
          )}

          {currentPath === '/members' && <MemberManagement members={members} onAddMember={addMember} />}

          {!['/dashboard', '/members'].includes(currentPath) && <PlaceholderPage title={activeItem.label} />}
        </div>
      </main>
    </div>
  );
}

export default App;
