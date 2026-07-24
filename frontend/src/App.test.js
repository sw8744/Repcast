import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { getUsers, registerUser } from './api/users';
import { __serialCommands, __setAuthFailures } from './serial/rfidSerial';

jest.mock('./api/users', () => ({
  getUsers: jest.fn(),
  registerUser: jest.fn(),
}));

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

test('/dashboard에서 RepCast 관리자 대시보드를 표시한다', () => {
  window.history.pushState({}, '', '/dashboard');
  render(<App />);
  expect(screen.getByRole('heading', { name: 'RepCast 관리자 대시보드' })).toBeInTheDocument();
  expect(screen.getByText('총 세션 수')).toBeInTheDocument();
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
