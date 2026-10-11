import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';

// Runs the production migration on real SQLite; Rust command tests live in store.rs.
test('production migration, CRUD for six collections, rollback, restart and deliveries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ngu-sqlite-'));
  let db;
  try {
    const file=join(dir,'test.sqlite');
    db=new DatabaseSync(file);
    db.exec(readFileSync(new URL('../src-tauri/migrations/001_initial.sql',import.meta.url),'utf8'));
    assert.equal(db.prepare('PRAGMA user_version').get().user_version,1);
    for (const kind of ['tasks','workouts','transactions','projects','goals','reminders']) {
      db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?)').run(kind,kind,JSON.stringify({title:'Первый', cents:29}));
      assert.equal(JSON.parse(db.prepare('SELECT data FROM records WHERE kind=?').get(kind).data).cents,29);
      db.prepare('UPDATE records SET data=? WHERE kind=?').run(JSON.stringify({title:'Изменён'}),kind);
    }
    db.exec('BEGIN'); db.exec('DELETE FROM records'); db.exec('ROLLBACK');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n,6);
    db.prepare('INSERT INTO deliveries(id,at) VALUES(?,?)').run('r','2026-10-11T00:00:00Z');
    db.close(); db=new DatabaseSync(file);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n,6);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deliveries').get().n,1);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    for (const kind of ['tasks','workouts','transactions','projects','goals','reminders']) db.prepare('DELETE FROM records WHERE kind=?').run(kind);
    db.close(); db=new DatabaseSync(file);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
  } finally { db?.close(); rmSync(dir,{recursive:true,force:true}); }
});
