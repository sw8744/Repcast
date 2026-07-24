import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { getEquipment } from './api/equipment';
import { getSessions } from './api/sessions';
import { getUsers, registerUser } from './api/users';
import { __serialCommands, __setAuthFailures } from './serial/rfidSerial';

jest.mock('./api/users', () => ({
  getUsers: jest.fn(),
  registerUser: jest.fn(),
}));

jest.mock('./api/equipment', () => ({
  getEquipment: jest.fn(),
}));

jest.mock('./api/sessions', () => {
  const actual = jest.requireActual('./api/sessions');
  return {
    ...actual,
    getSessions: jest.fn(),
  };
});

jest.mock('./serial/rfidSerial', () => {
  const uid = '1234567890abcdef';
  const commands = [];
  let remainingAuthFailures = 0;

  return {
    __serialCommands: commands,
    __setAuthFailures(count) {
      remainingAuthFailures = count;
    },
    getArduinoErrorMessage(line) {
      return line.startsWith('ERR,AUTH,Error in communication')
        ? '다시 시도해 주세요.'
        : `Arduino 오류: ${line}`;
    },
    isRetryableArduinoError(line) {
      return line.startsWith('ERR,AUTH,Error in communication');
    },
    RfidSerialClient: class MockRfidSerialClient {
      static isSupported() {
        return true;
      }

      constructor() {
        this.isConnected = false;
        this.readPhase = 'write';
      }

      async connect(onLine) {
        this.isConnected = true;
        onLine('READY,MODE,R');
      }

      async sendAndWait(command) {
        commands.push(command);
        return command === 'R' ? 'OK,MODE,R' : `OK,MODE,W,${uid}`;
      }

      async waitFor() {
        if (this.readPhase === 'write') {
          if (remainingAuthFailures > 0) {
            remainingAuthFailures -= 1;
            return 'ERR,AUTH,Error in communication.';
          }
          this.readPhase = 'verify';
          return `OK,W,${uid}`;
        }

        this.readPhase = 'write';
        return `OK,R,${uid}`;
      }
    },
  };
});

beforeEach(() => {
  __serialCommands.splice(0);
  __setAuthFailures(0);
  getEquipment.mockResolvedValue([]);
  getSessions.mockResolvedValue([]);
  getUsers.mockResolvedValue([]);
  registerUser.mockResolvedValue('1234567890abcdef');
});

function fillRegistrationForm() {
  fireEvent.change(screen.getByLabelText(/회원 이름/), { target: { value: '홍길동' } });
  fireEvent.change(screen.getByLabelText(/연락처/), { target: { value: '010-1234-5678' } });
  fireEvent.change(screen.getByLabelText(/이메일/), { target: { value: 'member@example.com' } });
  fireEvent.change(screen.getByLabelText('이용권'), { target: { value: '3개월 이용권' } });
  fireEvent.change(screen.getByLabelText('시작일'), { target: { value: '2026-07-24' } });
}

test('/dashboard에서 RepCast 관리자 대시보드를 표시한다', async () => {
  window.history.pushState({}, '', '/dashboard');
  render(<App />);
  expect(screen.getByRole('heading', { name: 'RepCast 관리자 대시보드' })).toBeInTheDocument();
  expect(screen.getByText('총 세션 수')).toBeInTheDocument();
  await waitFor(() => expect(getSessions).toHaveBeenCalledTimes(1));
});

test('/dashboard에 실제 세션 API 집계를 표시한다', async () => {
  getSessions.mockResolvedValue([{
    id: 'session-1',
    uid: 'user-1',
    memberName: '김민준',
    gymId: 'gym-1',
    gymName: 'Repcast 건국대점',
    equipmentId: 'equipment-1',
    equipmentName: '체스트 프레스',
    category: 'upper-chest',
    count: 36,
    sets: 3,
    weight: 40,
    volume: 1440,
    start: `${new Date().toISOString().slice(0, 10)}T10:00:00`,
    finish: `${new Date().toISOString().slice(0, 10)}T10:14:30`,
    date: new Date().toISOString().slice(0, 10),
    startTime: '10:00:00',
    finishTime: '10:14:30',
    durationSeconds: 870,
    duration: '00:14:30',
  }]);
  window.history.pushState({}, '', '/dashboard');
  render(<App />);

  await waitFor(() => expect(getSessions).toHaveBeenCalledTimes(1));
  expect(screen.getByText('총 세션 수').closest('.metric-card')).toHaveTextContent('1');
  expect(screen.getByText('총 운동 볼륨').closest('.metric-card')).toHaveTextContent('1,440');
  expect(screen.getAllByText('체스트 프레스').length).toBeGreaterThan(0);
});

test('/sessions에 실제 세션 API 기록을 표시한다', async () => {
  getSessions.mockResolvedValue([{
    id: 'session-2',
    uid: 'user-2',
    memberName: '이서연',
    gymId: 'gym-1',
    gymName: 'Repcast 건국대점',
    equipmentId: 'equipment-2',
    equipmentName: '레그 프레스',
    category: 'lower',
    count: 40,
    sets: 4,
    weight: 80,
    volume: 3200,
    start: '2026-07-23T11:00:00',
    finish: '2026-07-23T11:18:00',
    date: '2026-07-23',
    startTime: '11:00:00',
    finishTime: '11:18:00',
    durationSeconds: 1080,
    duration: '00:18:00',
  }]);
  window.history.pushState({}, '', '/sessions');
  render(<App />);

  expect(await screen.findByText('이서연')).toBeInTheDocument();
  expect(screen.getByText('레그 프레스')).toBeInTheDocument();
  expect(screen.getAllByText('3,200 kg')).toHaveLength(2);
  expect(getSessions).toHaveBeenCalledTimes(1);
});

test('/members에서 회원 등록 후 RFID 쓰기와 읽기 검증을 수행한다', async () => {
  window.history.pushState({}, '', '/members');
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Arduino 연결' }));
  expect(await screen.findByText('Arduino Nano 연결됨')).toBeInTheDocument();

  fillRegistrationForm();
  fireEvent.click(screen.getByRole('button', { name: '회원 등록 및 카드 발급' }));

  expect(await screen.findByText('홍길동 회원과 RFID 카드가 등록되었습니다.')).toBeInTheDocument();
  expect(screen.getByText('01012345678')).toBeInTheDocument();
  expect(screen.getByText('member@example.com')).toBeInTheDocument();
  expect(registerUser).toHaveBeenCalledWith(expect.objectContaining({
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'member@example.com',
  }));
  await waitFor(() => expect(__serialCommands).toEqual(['W,1234567890abcdef', 'R']));
});

test('/user API 회원의 전화번호와 이메일을 연락처에 표시한다', async () => {
  getUsers.mockResolvedValue([{
    id: 'member-1',
    name: '테스트 회원',
    phone: '01012345678',
    email: 'test@test.com',
    plan: '1개월 이용권',
    startDate: '2026-07-24',
    expireDate: '2026-08-31',
    lastUsed: '2026-07-30 18:20',
    status: '이용 중',
  }]);
  window.history.pushState({}, '', '/members');
  render(<App />);

  expect(await screen.findByText('01012345678')).toBeInTheDocument();
  expect(screen.getByText('test@test.com')).toBeInTheDocument();
  expect(screen.getByText('2026-07-30 18:20')).toBeInTheDocument();
  expect(getUsers).toHaveBeenCalledTimes(1);
});

test('/equipment API 운동기구를 기구 관리 페이지에 표시한다', async () => {
  getEquipment.mockResolvedValue([{
    id: 'equipment-1',
    name: '숄더 프레스',
    category: 'upper-shoulder',
    categoryLabel: '상체 · 어깨',
    lastUsed: '2026-07-23 11:42',
    gym: 'gym-1',
    status: '운영 중',
  }]);
  window.history.pushState({}, '', '/equipment');
  render(<App />);

  expect(await screen.findByText('숄더 프레스')).toBeInTheDocument();
  expect(screen.getAllByText('상체 · 어깨')).toHaveLength(2);
  expect(screen.getByLabelText('상체 · 어깨 아이콘')).toBeInTheDocument();
  expect(screen.getByText('2026-07-23 11:42')).toBeInTheDocument();
  expect(screen.getAllByText('운영 중')).toHaveLength(2);
  expect(getEquipment).toHaveBeenCalledTimes(1);
});

test('RFID 인증 통신 오류가 반복되어도 횟수 제한 없이 자동으로 다시 시도한다', async () => {
  __setAuthFailures(4);
  window.history.pushState({}, '', '/members');
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Arduino 연결' }));
  expect(await screen.findByText('Arduino Nano 연결됨')).toBeInTheDocument();

  fillRegistrationForm();
  fireEvent.click(screen.getByRole('button', { name: '회원 등록 및 카드 발급' }));

  expect(await screen.findByText(/자동 재시도 중/)).toBeInTheDocument();
  expect(await screen.findByText('홍길동 회원과 RFID 카드가 등록되었습니다.', {}, { timeout: 6000 }))
    .toBeInTheDocument();
  expect(__serialCommands).toEqual([
    'W,1234567890abcdef',
    'W,1234567890abcdef',
    'W,1234567890abcdef',
    'W,1234567890abcdef',
    'W,1234567890abcdef',
    'R',
  ]);
}, 7000);

test('자동 재시도 중 카드 등록을 취소할 수 있다', async () => {
  __setAuthFailures(10);
  window.history.pushState({}, '', '/members');
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Arduino 연결' }));
  expect(await screen.findByText('Arduino Nano 연결됨')).toBeInTheDocument();

  fillRegistrationForm();
  fireEvent.click(screen.getByRole('button', { name: '회원 등록 및 카드 발급' }));

  expect(await screen.findByText(/자동 재시도 중/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '카드 등록 취소' }));

  expect(await screen.findByText(/카드 등록을 취소했습니다/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'RFID 카드 작업 다시 시도' })).toBeInTheDocument();
  expect(__serialCommands).toEqual(['W,1234567890abcdef']);
});
