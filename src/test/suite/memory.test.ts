import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SQLiteMemory } from '../../memory/SQLiteMemory';

// Runs inside the real VS Code extension host, so this proves the Decision Journal
// database opens under VS Code's own Node/Electron runtime, not just in Jest.
suite('Decision Journal storage (VS Code runtime)', () => {
  test('opens, writes and reads the database', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-memory-'));
    const memory = new SQLiteMemory(root);
    memory.initialize();
    try {
      assert.strictEqual(memory.isAvailable, true, 'SQLite should open inside VS Code');

      const inserted = memory.insert({
        id: 'e2e-1',
        timestamp: Date.now(),
        project_id: 'orbit',
        file_path: 'src/a.ts',
        change_type: 'refactor',
        what: '["rename"]',
        why: 'clarity',
        improvements: '',
        tradeoffs: '',
        production: '',
        approved: true
      } as any);
      assert.strictEqual(inserted, true);

      const rows = memory.query({ project_id: 'orbit' } as any);
      assert.strictEqual(rows.length, 1);
      assert.strictEqual(rows[0].approved, true);
    } finally {
      memory.close();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
