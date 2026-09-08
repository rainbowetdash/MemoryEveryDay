const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const model = require('../desktop-widget-model.js');
const source = fs.readFileSync(require('node:path').join(__dirname, '../desktop-widget.js'), 'utf8');
const start = source.indexOf('  async function setWindowSizePreset('), end = source.indexOf('  async function setupNativeWindowActions()', start);
let frame = { x: 1130, y: 23, width: 310, height: 215 }, scale = 2;
let area = { x: 0, y: 23, width: 1440, height: 877 };
let failNext = false;
const appWindow = {
  outerPosition: async () => ({ x: frame.x * scale, y: frame.y * scale }),
  innerSize: async () => ({ width: frame.width * scale, height: frame.height * scale }),
  setSize: async size => { if (failNext) { failNext = false; throw new Error('test failure'); } frame = { ...frame, width: size.width, height: size.height }; },
  setPosition: async position => { frame = { ...frame, x: position.x, y: position.y }; },
};
const context = vm.createContext({
  model, desktopVersion: '0.1.6', compareVersions: () => 1, updateWindowSizeButtons: () => {}, updateWidgetScale: () => {},
  $: () => ({}), setToast: () => {}, checkDesktopUpdate: async () => {},
  window: { __TAURI__: {
    window: { currentMonitor: async () => ({ scaleFactor: scale, workArea: { position: { x: area.x * scale, y: area.y * scale }, size: { width: area.width * scale, height: area.height * scale } } }) },
    dpi: { LogicalSize: class { constructor(width,height) { Object.assign(this,{width,height}); } }, LogicalPosition: class { constructor(x,y) { Object.assign(this,{x,y}); } } },
  } },
});
vm.runInContext('let resizingToPreset = false, activeWindowPreset = null, windowPresetPlacement = null;\n' + source.slice(start,end),context);
(async () => {
  for (const key of ['large','medium','small','large','small']) {
    await context.setWindowSizePreset(key,appWindow);
    assert.equal(frame.x + frame.width,1440); assert.equal(frame.y,23);
  }
  assert.deepEqual(frame,{x:1130,y:23,width:310,height:215});
  // Manual movement and free resizing replace the old remembered placement.
  frame = {x:12,y:36,width:450,height:300};
  await context.setWindowSizePreset('large',appWindow);
  await context.setWindowSizePreset('small',appWindow);
  assert.deepEqual(frame,{x:12,y:36,width:310,height:215});
  // Moving to a monitor with a negative origin and different DPI must re-anchor.
  area = {x:-1920,y:0,width:1920,height:1080}; scale = 1.25;
  frame = {x:-320,y:10,width:310,height:215};
  await context.setWindowSizePreset('large',appWindow);
  await context.setWindowSizePreset('small',appWindow);
  assert.deepEqual(frame,{x:-320,y:10,width:310,height:215});
  failNext = true; await context.setWindowSizePreset('large',appWindow);
  await context.setWindowSizePreset('medium',appWindow);
  assert.deepEqual(frame,{x:-630,y:10,width:620,height:430});
  console.log('desktop placement integration tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
