import {
  getArduinoErrorMessage,
  isRetryableArduinoError,
  RfidSerialClient,
} from './rfidSerial';

test('RFID 인증 통신 오류를 재시도 안내로 변환한다', () => {
  expect(isRetryableArduinoError('ERR,AUTH,Error in communication.')).toBe(true);
  expect(getArduinoErrorMessage('ERR,AUTH,Error in communication.'))
    .toBe('다시 시도해 주세요.');
});

test('다른 Arduino 오류는 상세 내용을 유지한다', () => {
  expect(isRetryableArduinoError('ERR,READ,Timeout in communication.')).toBe(false);
  expect(getArduinoErrorMessage('ERR,READ,Timeout in communication.'))
    .toBe('Arduino 오류: ERR,READ,Timeout in communication.');
});

test('카드 등록 취소 시 대기 중인 Arduino 응답을 즉시 정리한다', async () => {
  const client = new RfidSerialClient();
  const controller = new AbortController();
  const response = client.waitFor(() => true, 60000, controller.signal);

  controller.abort();

  await expect(response).rejects.toMatchObject({ name: 'AbortError' });
  expect(client.waiters).toHaveLength(0);
});
