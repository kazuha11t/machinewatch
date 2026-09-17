import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
import { Store } from '../src/db.ts';

describe('Store migrations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'machinewatch-db-'));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it('adds the simulated column to a devices table created before it existed', () => {
    const path = join(dir, 'legacy.db');
    const legacy = new DatabaseSync(path);
    legacy.exec(`CREATE TABLE devices (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'machine', location TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'offline', last_seen INTEGER, relay_state INTEGER, health_score REAL, health_status TEXT,
      ai_status TEXT, ai_progress REAL, hours_to_limit REAL, created_at INTEGER NOT NULL
    )`);
    legacy.prepare('INSERT INTO devices (id, name, created_at) VALUES (?, ?, ?)').run('press-01', 'Press', 1);
    legacy.close();

    const store = new Store(path);
    try {
      assert.equal(store.getDevice('press-01')?.simulated, false);
      store.applyMetadata('press-01', { simulated: true });
      assert.equal(store.getDevice('press-01')?.simulated, true);
    } finally {
      store.close();
    }
  });
});
