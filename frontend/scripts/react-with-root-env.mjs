import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const command = process.argv[2];
const supportedCommands = new Set(['start', 'build']);

if (!supportedCommands.has(command)) {
  throw new Error(`지원하지 않는 react-scripts 명령입니다: ${command || '(없음)'}`);
}

const rootEnvPath = resolve(process.cwd(), '..', '.env');
const envContents = await readFile(rootEnvPath, 'utf8');
const apiLine = envContents
  .split(/\r?\n/)
  .map((line) => line.trim())
  .find((line) => line && !line.startsWith('#') && /^(?:export\s+)?API_ADDR\s*=/.test(line));

if (!apiLine) {
  throw new Error('루트 .env 파일에 API_ADDR를 설정해 주세요.');
}

let apiAddress = apiLine.replace(/^(?:export\s+)?API_ADDR\s*=\s*/, '').trim();
if (
  (apiAddress.startsWith('"') && apiAddress.endsWith('"')) ||
  (apiAddress.startsWith("'") && apiAddress.endsWith("'"))
) {
  apiAddress = apiAddress.slice(1, -1);
}

if (!apiAddress) {
  throw new Error('루트 .env의 API_ADDR 값이 비어 있습니다.');
}

const reactScripts = resolve(process.cwd(), 'node_modules', 'react-scripts', 'bin', 'react-scripts.js');
const child = spawn(process.execPath, [reactScripts, command], {
  stdio: 'inherit',
  env: {
    ...process.env,
    REACT_APP_API_ADDR: apiAddress.replace(/\/$/, ''),
  },
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
