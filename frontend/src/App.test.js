import { render, screen } from '@testing-library/react';
import App from './App';

test('RepCast 관리자 대시보드를 표시한다', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: 'RepCast 관리자 대시보드' })).toBeInTheDocument();
  expect(screen.getByText('총 세션 수')).toBeInTheDocument();
});
