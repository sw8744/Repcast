const DEFAULT_TIMEOUT_MS = 60000;

export function isRetryableArduinoError(line) {
  return line.startsWith('ERR,AUTH,Error in communication');
}

export function getArduinoErrorMessage(line) {
  if (isRetryableArduinoError(line)) {
    return '다시 시도해 주세요.';
  }
  return `Arduino 오류: ${line}`;
}

export class RfidSerialClient {
  constructor() {
    this.port = null;
    this.reader = null;
    this.writer = null;
    this.readBuffer = '';
    this.waiters = [];
    this.lineListener = null;
  }

  static isSupported() {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  get isConnected() {
    return Boolean(this.port && this.reader && this.writer);
  }

  async connect(lineListener) {
    if (!RfidSerialClient.isSupported()) {
      throw new Error('이 브라우저는 Web Serial을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요.');
    }

    this.lineListener = lineListener;
    this.port = await navigator.serial.requestPort();
    await this.port.open({ baudRate: 9600 });
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    this.readLoop();
  }

  async readLoop() {
    const decoder = new TextDecoder();

    try {
      while (this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (!value) continue;

        this.readBuffer += decoder.decode(value, { stream: true });
        const lines = this.readBuffer.split(/\r?\n/);
        this.readBuffer = lines.pop() || '';
        lines.map((line) => line.trim()).filter(Boolean).forEach((line) => this.dispatchLine(line));
      }
    } catch (error) {
      if (this.reader) {
        this.rejectWaiters(new Error(`Arduino 연결이 끊어졌습니다: ${error.message}`));
      }
    }
  }

  dispatchLine(line) {
    this.lineListener?.(line);

    const matchingIndex = this.waiters.findIndex(({ predicate }) => predicate(line));
    if (matchingIndex === -1) return;

    const [waiter] = this.waiters.splice(matchingIndex, 1);
    window.clearTimeout(waiter.timer);
    waiter.resolve(line);
  }

  waitFor(predicate, timeoutMs = DEFAULT_TIMEOUT_MS, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('카드 등록이 취소되었습니다.', 'AbortError'));
        return;
      }

      const cleanup = (waiter) => {
        window.clearTimeout(waiter.timer);
        signal?.removeEventListener('abort', abortWait);
      };
      const waiter = {
        predicate,
        resolve: (line) => {
          cleanup(waiter);
          resolve(line);
        },
        reject: (error) => {
          cleanup(waiter);
          reject(error);
        },
        timer: window.setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          waiter.reject(new Error('Arduino 응답 시간이 초과되었습니다. 카드를 다시 태그해 주세요.'));
        }, timeoutMs),
      };
      const abortWait = () => {
        this.waiters = this.waiters.filter((item) => item !== waiter);
        waiter.reject(new DOMException('카드 등록이 취소되었습니다.', 'AbortError'));
      };
      signal?.addEventListener('abort', abortWait, { once: true });
      this.waiters.push(waiter);
    });
  }

  async sendAndWait(command, predicate, timeoutMs = 5000, signal) {
    const response = this.waitFor(predicate, timeoutMs, signal);
    await this.writeLine(command);
    return response;
  }

  async writeLine(command) {
    if (!this.writer) {
      throw new Error('Arduino가 연결되어 있지 않습니다.');
    }
    await this.writer.write(new TextEncoder().encode(`${command}\n`));
  }

  rejectWaiters(error) {
    this.waiters.splice(0).forEach((waiter) => {
      window.clearTimeout(waiter.timer);
      waiter.reject(error);
    });
  }
}
