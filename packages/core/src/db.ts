import Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations.js";

export type OutreachDb = Database.Database;

export function openDatabase(dbPath: string): OutreachDb {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return db;
}
export function migrate(db: OutreachDb): void {
    db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
    const applied = new Set(
        db
            .prepare("SELECT version FROM schema_migrations")
            .all()
            .map((r) => (r as { version: number }).version),
    );
    for (const m of MIGRATIONS) {
        if (applied.has(m.version))
            continue;
        const run = db.transaction(() => {
            db.exec(m.sql);
            db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(m.version, new Date().toISOString());
        });
        run();
    }
}
export function openAndMigrate(dbPath: string): OutreachDb {
    const db = openDatabase(dbPath);
    migrate(db);
    return db;
}
//# sourceMappingURL=db.js.map