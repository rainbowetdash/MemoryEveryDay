const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const functions = ['queueOperation', 'flushPendingOps'].map(name => source.split('\n').find(line => line.startsWith(`function ${name}(`) || line.startsWith(`async function ${name}(`))).join('\n');

async function verifyDuringUpload(nextType, reject = false) {
  let pending = [], finishUpload;
  const timers = [], uploaded = [], state = { user: { id: 'test-user' }, syncBusy: false };
  const context = vm.createContext({
    state, crypto: { randomUUID }, supabaseClient: {},
    readPending: () => structuredClone(pending), writePending: value => { pending = structuredClone(value); },
    pendingStorageKey: () => 'test-queue', localStorage: { setItem: (_, value) => { pending = JSON.parse(value); } },
    setSyncStatus: () => {}, setTimeout: task => timers.push(task),
    syncEventUpsert: event => { uploaded.push(event.title); return new Promise((resolve, fail) => { finishUpload = reject ? () => fail(new Error('offline')) : () => resolve(null); }); },
  });
  vm.runInContext(functions, context);
  context.queueOperation({ type: 'upsert', id: 'event', event: { title: 'first' } });
  const firstUpload = context.flushPendingOps();
  if (nextType) context.queueOperation({ type: nextType, id: 'event', ...(nextType === 'upsert' ? { event: { title: 'latest' } } : {}) });
  finishUpload(); await firstUpload;
  assert.equal(state.syncBusy, false);
  assert.deepEqual(uploaded, ['first']);
  if (nextType) {
    assert.equal(pending.length, 1);
    assert.equal(pending[0].type, nextType);
    if (nextType === 'upsert') assert.equal(pending[0].event.title, 'latest');
    assert.equal(timers.length, 1, 'newer changes must trigger the next upload');
  } else {
    assert.equal(pending.length, reject ? 1 : 0);
    assert.equal(timers.length, 0, 'offline retries must not spin continuously');
  }
}
(async () => {
  await verifyDuringUpload('upsert');
  await verifyDuringUpload('delete');
  await verifyDuringUpload('upsert', true);
  await verifyDuringUpload(null, true);
  await verifyDuringUpload(null);
  console.log('event autosave sync tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
