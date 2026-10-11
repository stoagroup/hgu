BEGIN IMMEDIATE;
CREATE TABLE records (
    kind TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    PRIMARY KEY (kind, id)
);
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE deliveries (id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (id, at));
PRAGMA user_version = 1;
COMMIT;
