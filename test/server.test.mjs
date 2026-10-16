import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp, normalizeQuestion, parseModelAnswer, makeOcsConfig, validateSettings } from '../server.mjs';

const single = { title: '1+1=?', type: 'single', options: 'A.1\nB.2\nC.3' };
const ui = { 'X-Local-UI': '1', 'Content-Type': 'application/json' };
const jsonAnswer = (kind, answers, extra = {}) => JSON.stringify({ kind, answers, explanation: '示例解析', uncertain: false, ...extra });
const cleanup = dir => { assert.ok(resolve(dir).startsWith(resolve(tmpdir()) + sep)); rmSync(dir, { recursive: true, force: true }); };

test('choice formats enforce option bounds and preserve OCS letter fallback', () => {
  assert.equal(parseModelAnswer(jsonAnswer('single', ['b']), single).answer, 'B');
  assert.equal(parseModelAnswer(jsonAnswer('multiple', ['C', 'A']), { ...single, type: 'multiple' }).answer, 'AC');
  assert.throws(() => parseModelAnswer(jsonAnswer('single', ['D']), single), /选项范围/);
  assert.throws(() => parseModelAnswer(jsonAnswer('single', ['A', 'B']), single), /多个答案/);
  assert.throws(() => parseModelAnswer(jsonAnswer('multiple', ['A']), single), /题型/);
});

test('judgement and completion preserve false values and punctuation', () => {
  assert.equal(parseModelAnswer(jsonAnswer('judgement', ['false']), { type: 'judgement' }).answer, '错误');
  const answers = ['a;b', 'C#', 'x|y'];
  assert.deepEqual(JSON.parse(parseModelAnswer(jsonAnswer('completion', answers), { type: 'completion' }).answer), answers);
  assert.deepEqual(JSON.parse(parseModelAnswer(jsonAnswer('short', ['第一点；第二点']), { type: 'short' }).answer), ['第一点；第二点']);
});

test('empty, uncertain, invalid JSON and malformed results never become answers', () => {
  for (const text of ['', '答案 B', '{}', 'null', jsonAnswer('single', []), jsonAnswer('single', ['B'], { uncertain: true })]) {
    assert.throws(() => parseModelAnswer(text, single));
  }
  assert.equal(parseModelAnswer('```json\n' + jsonAnswer('single', ['B']) + '\n```', single).answer, 'B');
});

test('question validation declines images and missing choice options', () => {
  assert.throws(() => normalizeQuestion({ title: '${title}' }), /题干/);
  assert.throws(() => normalizeQuestion({ ...single, options: '' }), /缺少选项/);
  assert.throws(() => normalizeQuestion({ ...single, title: '看图 [图片1]' }), /图片/);
  assert.throws(() => normalizeQuestion({ ...single, images: ['data:image/png;base64,abc'] }), /图片/);
  assert.equal(normalizeQuestion({ title: '判断', type: '判断题' }).type, 'judgement');
});

test('settings preserve secret on blank input and accept completion URL', () => {
  const settings = validateSettings({ apiKey: 'secret', baseUrl: 'http://127.0.0.1:8317/v1/chat/completions' });
  assert.equal(settings.baseUrl, 'http://127.0.0.1:8317/v1');
  assert.equal(validateSettings({ apiKey: '' }, settings).apiKey, 'secret');
  assert.equal(validateSettings({ clearApiKey: true }, settings).apiKey, '');
  assert.throws(() => validateSettings({ baseUrl: 'http://key@localhost/v1' }));
  assert.throws(() => validateSettings({ apiKey: 'a\nb' }));
});

test('generated OCS handler returns a string answer and surfaces errors', () => {
  const [config] = makeOcsConfig('http://127.0.0.1:8765', 'local-token');
  assert.equal(config.type, 'GM_xmlhttpRequest');
  assert.equal(config.data.title, '${title}');
  const handler = Function(config.handler)();
  assert.deepEqual(handler({ code: 1, question: 'q', answer: 'AC', cached: true }).slice(0, 2), ['q', 'AC']);
  assert.throws(() => handler({ code: 0, message: '认证失败' }), /认证失败/);
});

test('HTTP lifecycle: auth, models, probes, caching, duplicate requests, persistence', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ocs-wb-test-'));
  let calls = 0;
  const mock = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer private-gateway-key');
    if (url.endsWith('/models')) return Response.json({ data: [{ id: 'deepseek-v4.1-flash' }] });
    calls++;
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'deepseek-v4.1-flash');
    assert.equal(body.stream, false);
    assert.equal(JSON.parse(body.messages[1].content).title, single.title);
    await new Promise(r => setTimeout(r, 30));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: jsonAnswer('single', ['B']) } }] });
  };
  const app = createApp({ dataDir: dir, port: 0, fetchImpl: mock });
  const address = await app.listen();
  t.after(async () => { await app.close(); cleanup(dir); });
  const post = (path, body, headers = ui) => fetch(address + path, { method: 'POST', headers, body: JSON.stringify(body) });
  assert.equal((await fetch(address + '/api/state')).status, 403);
  assert.equal((await fetch(address + '/api/state', { headers: { ...ui, Origin: 'https://evil.invalid' } })).status, 403);
  assert.equal((await post('/api/settings', { apiKey: 'private-gateway-key' })).status, 200);
  const state = await (await fetch(address + '/api/state', { headers: ui })).json();
  assert.equal(state.settings.apiKey, undefined);
  assert.equal(state.settings.hasApiKey, true);
  assert.ok(!JSON.stringify(state).includes('private-gateway-key'));
  const [config] = state.ocsConfig;
  const saved = JSON.parse(readFileSync(join(dir, 'ocs-config.json'), 'utf8'));
  assert.equal(saved[0].url, address + '/ocs/answer');
  assert.equal((await fetch(address + '/ocs/answer', { method: 'HEAD' })).status, 200);
  assert.equal((await fetch(address + '/ocs/answer?t=probe')).status, 200);
  assert.equal(calls, 0, 'health probes do not spend a model request');
  assert.equal((await post('/ocs/answer', single)).status, 401);
  const models = await (await post('/api/models', {})).json();
  assert.equal(models.selectedAvailable, true);
  const replies = await Promise.all([post('/ocs/answer', single, config.headers), post('/ocs/answer', single, config.headers)]);
  for (const response of replies) assert.equal((await response.json()).answer, 'B');
  assert.equal(calls, 1, 'duplicate concurrent questions share one request');
  const cached = await (await post('/ocs/answer', single, config.headers)).json();
  assert.equal(cached.cached, true);
  assert.equal(calls, 1);
  assert.equal((await (await post('/ocs/answer', { ...single, options: '' }, config.headers)).json()).code, 0);
  assert.equal(JSON.parse(readFileSync(join(dir, 'cache.json'), 'utf8')).length, 1);
  const cache = await (await fetch(address + '/api/cache', { headers: ui })).json();
  assert.equal((await post('/api/cache/delete', { id: cache.rows[0].id })).status, 200);
  assert.equal(JSON.parse(readFileSync(join(dir, 'cache.json'), 'utf8')).length, 0);
});

test('gateway authentication errors and truncated output are not cached', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'ocs-wb-errors-'));
  let mode = 'auth';
  const app = createApp({ dataDir: dir, port: 0, fetchImpl: async () => mode === 'auth'
    ? new Response('secret diagnostic text', { status: 401 })
    : Response.json({ choices: [{ finish_reason: 'length', message: { content: jsonAnswer('single', ['B']) } }] }) });
  const address = await app.listen();
  t.after(async () => { await app.close(); cleanup(dir); });
  await assert.rejects(app.answer(single), /API Key/);
  mode = 'truncated';
  await assert.rejects(app.answer(single), /截断/);
  const rows = await (await fetch(address + '/api/cache', { headers: ui })).json();
  assert.equal(rows.rows.length, 0);
});
