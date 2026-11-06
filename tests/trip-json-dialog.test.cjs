const assert = require('node:assert/strict');
const { it } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = readFileSync(path.join(__dirname, '../TripJson.html'), 'utf8');

function dialog(json = '') {
  const elements = new Map();
  for (const id of ['download', 'downloadLink', 'upload', 'file', 'importButton', 'status']) {
    elements.set(id, {
      hidden: true, files: [], disabled: false,
      addEventListener(event, handler) { this[event] = handler; }
    });
  }
  const state = { confirmed: true, imports: [], elements };
  const runner = {
    withSuccessHandler(handler) { state.success = handler; return runner; },
    withFailureHandler(handler) { state.failure = handler; return runner; },
    importTripJson(value) { state.imports.push(value); }
  };
  const context = vm.createContext({
    Blob,
    URL: { createObjectURL(blob) { state.blob = blob; return 'blob:test'; }, revokeObjectURL() {} },
    document: { getElementById: id => elements.get(id) },
    window: { addEventListener() {}, confirm: () => state.confirmed },
    google: { script: { run: runner } }
  });
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1]
    .replace('<?!= tripJsonLiteral ?>', JSON.stringify(json).replace(/</g, '\\u003c'));
  vm.runInContext(source, context, { filename: 'TripJson.html' });
  return state;
}

it('download dialog creates a JSON file containing the complete saved snapshot', async () => {
  const trip = { setup: { tripName: 'Goa / Nov 2026' }, expenses: [['', '</script>🚕', 10, 'Alice', 'All']] };
  const state = dialog(JSON.stringify(trip));
  assert.equal(state.elements.get('download').hidden, false);
  assert.equal(state.elements.get('upload').hidden, true);
  assert.equal(state.elements.get('downloadLink').download, 'Goa_Nov_2026.json');
  assert.equal(state.elements.get('downloadLink').href, 'blob:test');
  assert.equal(state.blob.type, 'application/json');
  assert.deepEqual(JSON.parse(await state.blob.text()), trip);
});

it('import dialog requires a file and confirmation before calling the server', async () => {
  const state = dialog();
  const button = state.elements.get('importButton');
  assert.equal(state.elements.get('upload').hidden, false);
  await button.click();
  assert.equal(state.elements.get('status').textContent, 'Choose a JSON file first.');
  state.elements.get('file').files = [{ text: async () => '{"trip":true}' }];
  state.confirmed = false;
  await button.click();
  assert.equal(state.imports.length, 0);
  assert.equal(button.disabled, false);
});

it('import dialog passes file contents unchanged and reports server success', async () => {
  const state = dialog();
  const button = state.elements.get('importButton');
  const json = '{"description":"₹10.01 🚕"}';
  state.elements.get('file').files = [{ text: async () => json }];
  await button.click();
  assert.deepEqual(state.imports, [json]);
  assert.equal(button.disabled, true);
  state.success('Trip imported and loaded.');
  assert.equal(button.disabled, false);
  assert.equal(state.elements.get('status').textContent, 'Trip imported and loaded.');
});

it('import dialog recovers after server validation and file-reading errors', async () => {
  const state = dialog();
  const button = state.elements.get('importButton');
  state.elements.get('file').files = [{ text: async () => '{}' }];
  await button.click();
  state.failure({ message: 'Unsupported trip JSON format or version.' });
  assert.equal(button.disabled, false);
  assert.match(state.elements.get('status').textContent, /Unsupported/);
  state.elements.get('file').files = [{ text: async () => { throw new Error('Cannot read file.'); } }];
  await button.click();
  assert.equal(button.disabled, false);
  assert.equal(state.elements.get('status').textContent, 'Cannot read file.');
  assert.equal(state.imports.length, 1);
});
