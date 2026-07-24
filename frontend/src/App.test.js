import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { registerUser } from './api/users';
import { __serialCommands } from './serial/rfidSerial';

jest.mock('./api/users', () => ({
  registerUser: jest.fn(),
}));

jest.mock('./serial/rfidSerial', () => {
  const uid = '1234567890abcdef';
  const commands = [];

  return {
    __serialCommands: commands,
    RfidSerialClient: class MockRfidSerialClient {
      static isSupported() {
        return true;
      }

      constructor() {
        this.isConnected = false;
        this.readCount = 0;
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
        this.readCount += 1;
        return this.readCount === 1 ? `OK,W,${uid}` : `OK,R,${uid}`;
      }
    },
  };
});

beforeEach(() => {
  __serialCommands.splice(0);
  registerUser.mockResolvedValue('1234567890abcdef');
});

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

  fireEvent.change(screen.getByPlaceholderText('예: 홍길동'), { target: { value: '홍길동' } });
  fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1234-5678' } });
  fireEvent.change(screen.getByPlaceholderText('member@example.com'), { target: { value: 'member@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: '회원 등록 및 카드 발급' }));

  expect(await screen.findByText('홍길동 회원과 RFID 카드가 등록되었습니다.')).toBeInTheDocument();
  expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
  expect(registerUser).toHaveBeenCalledWith(expect.objectContaining({
    name: '홍길동',
    phone: '010-1234-5678',
    email: 'member@example.com',
  }));
  await waitFor(() => expect(__serialCommands).toEqual(['W,1234567890abcdef', 'R']));
});
