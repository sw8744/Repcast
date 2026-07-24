import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

test('/dashboard에서 RepCast 관리자 대시보드를 표시한다', () => {
  window.history.pushState({}, '', '/dashboard');
  render(<App />);
  expect(screen.getByRole('heading', { name: 'RepCast 관리자 대시보드' })).toBeInTheDocument();
  expect(screen.getByText('총 세션 수')).toBeInTheDocument();
});

test('/members에서 신규 회원을 추가한다', () => {
  window.history.pushState({}, '', '/members');
  render(<App />);

  fireEvent.change(screen.getByPlaceholderText('예: 홍길동'), { target: { value: '홍길동' } });
  fireEvent.change(screen.getByPlaceholderText('010-0000-0000'), { target: { value: '010-1234-5678' } });
  fireEvent.click(screen.getByRole('button', { name: '회원 추가' }));

  expect(screen.getByText('홍길동 회원이 등록되었습니다.')).toBeInTheDocument();
  expect(screen.getByText('010-1234-5678')).toBeInTheDocument();
});
