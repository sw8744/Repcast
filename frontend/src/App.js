import { useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  Dumbbell,
  Flame,
  Gauge,
  LayoutDashboard,
  Menu,
  RefreshCw,
  Repeat2,
  Settings,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import './App.css';

const navigation = [
  { label: '대시보드', icon: LayoutDashboard },
  { label: '세션 기록', icon: CalendarDays },
  { label: '회원 관리', icon: Users },
  { label: '기구 관리', icon: Dumbbell },
  { label: '통계 분석', icon: BarChart3 },
  { label: '설정', icon: Settings },
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

function App() {
  const [activeNav, setActiveNav] = useState('대시보드');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [lastUpdated, setLastUpdated] = useState('14:30');
  const [refreshing, setRefreshing] = useState(false);

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
          {navigation.map(({ label, icon: Icon }) => (
            <button
              key={label}
              className={activeNav === label ? 'active' : ''}
              onClick={() => {
                setActiveNav(label);
                setSidebarOpen(false);
              }}
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
              <h1>RepCast 관리자 대시보드</h1>
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
          {activeNav !== '대시보드' && (
            <div className="section-notice">
              <Gauge size={18} /> 현재 <strong>{activeNav}</strong> 메뉴의 대시보드 미리보기를 보고 있습니다.
            </div>
          )}

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
        </div>
      </main>
    </div>
  );
}

export default App;
