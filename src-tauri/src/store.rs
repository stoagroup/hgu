use chrono::{DateTime, Local, NaiveDate, NaiveTime};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::{collections::HashSet, path::Path};

pub const KINDS: [&str; 6] = ["tasks", "workouts", "transactions", "projects", "goals", "reminders"];
type Result<T> = std::result::Result<T, String>;
pub struct Store { pub conn: Connection }
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn text<'a>(v: &'a Value, key: &str, required: bool) -> Result<&'a str> {
    let s = v[key].as_str().ok_or(format!("Поле {key}: ожидается текст"))?;
    if s.len() > 10000 || (required && s.trim().is_empty()) { return Err(format!("Некорректное поле {key}")); }
    Ok(s)
}
fn date(v: &Value, key: &str, optional: bool) -> Result<()> {
    let s = text(v, key, !optional)?;
    if optional && s.is_empty() { return Ok(()); }
    if s.len() != 10 || !NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok_and(|d| d.format("%Y-%m-%d").to_string() == s) { return Err(format!("Некорректная дата: {key}")); }
    Ok(())
}
fn boolean(v: &Value, key: &str) -> Result<()> { v[key].as_bool().map(|_| ()).ok_or(format!("Некорректный флаг {key}")) }
fn choice(v: &Value, key: &str, values: &[&str]) -> Result<()> { if values.contains(&text(v,key,true)?) { Ok(()) } else { Err(format!("Некорректное значение {key}")) } }
pub fn validate(data: &Value) -> Result<()> {
    if data["schema"] != 1 { return Err("Неподдерживаемая версия резервной копии".into()); }
    let mut ids = HashSet::new();
    let mut total_cents: i64 = 0;
    for kind in KINDS {
        let rows = data[kind].as_array().ok_or(format!("Отсутствует раздел {kind}"))?;
        if rows.len() > 10000 { return Err("Слишком много записей".into()); }
        for row in rows {
            let id = text(row,"id",true)?;
            if id.len() > 100 || !ids.insert(id.to_string()) { return Err("Повторяющийся или неверный идентификатор".into()); }
            if kind != "transactions" { text(row,"title",true)?; }
            match kind {
                "tasks" => { date(row,"date",false)?; let t=text(row,"time",true)?; if t.len()!=5 || NaiveTime::parse_from_str(t,"%H:%M").is_err() { return Err("Некорректное время".into()); } boolean(row,"done")?; }
                "workouts" => { if !row["day"].as_u64().is_some_and(|n| n<7) || !row["sets"].as_u64().is_some_and(|n| (1..=1000).contains(&n)) { return Err("Неверный день или число подходов".into()); } text(row,"reps",true)?; text(row,"notes",false)?; }
                "transactions" => { choice(row,"kind", &["income","expense"])?; text(row,"category",true)?; text(row,"notes",false)?; date(row,"date",false)?; if !row["cents"].as_i64().is_some_and(|n| n>0 && n<=999_999_999_999) { return Err("Неверная сумма в копейках".into()); } total_cents += row["cents"].as_i64().unwrap(); if total_cents > 9_007_199_254_740_991 { return Err("Общая сумма превышает предел точного учёта".into()); } }
                "projects" => { text(row,"description",false)?; date(row,"deadline",true)?; choice(row,"status", &["active","paused","done"])?; let tasks=row["tasks"].as_array().ok_or("Неверный список задач")?; if tasks.len()>10000 { return Err("Слишком много задач".into()); } for t in tasks { let id=text(t,"id",true)?; if !ids.insert(id.to_string()) { return Err("Повтор идентификатора задачи".into()); } text(t,"title",true)?; boolean(t,"done")?; } }
                "goals" => { date(row,"deadline",false)?; text(row,"unit",true)?; for key in ["target","current"] { let n=row[key].as_f64().ok_or("Неверный прогресс цели")?; if !n.is_finite() || n<0.0 || n>1e12 || (key=="target" && n==0.0) { return Err("Неверный прогресс цели".into()); } } }
                "reminders" => { let at=text(row,"at",true)?; DateTime::parse_from_rfc3339(at).map_err(err)?; boolean(row,"enabled")?; }
                _ => unreachable!()
            }
        }
    }
    boolean(&data["settings"],"compact")?; boolean(&data["settings"],"closeToTray")?;
    choice(&data["settings"],"accent", &["lime","sage"])?;
    Ok(())
}
pub fn seed() -> Value {
    let today=Local::now().format("%Y-%m-%d").to_string();
    json!({"schema":1,"tasks":[
        {"id":"sample-task-1","title":"Наметить три главных дела","date":today,"time":"08:30","done":false},
        {"id":"sample-task-2","title":"Прогулка без телефона","date":today,"time":"18:00","done":false},
        {"id":"sample-task-3","title":"Подвести итоги дня","date":today,"time":"21:00","done":false}],
        "workouts":[{"id":"sample-workout-1","day":0,"title":"Приседания","sets":3,"reps":"12","notes":"Редактируемый пример — подберите нагрузку под себя"},{"id":"sample-workout-2","day":2,"title":"Отжимания","sets":3,"reps":"8–12","notes":"В комфортном темпе"},{"id":"sample-workout-3","day":4,"title":"Планка","sets":3,"reps":"30 секунд","notes":""}],
        "transactions":[],"projects":[],"goals":[],"reminders":[],"settings":{"compact":false,"accent":"lime","closeToTray":true}})
}
impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        let conn=Connection::open(path).map_err(err)?;
        conn.busy_timeout(std::time::Duration::from_secs(5)).map_err(err)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").map_err(err)?;
        let version: i64=conn.pragma_query_value(None,"user_version",|r|r.get(0)).map_err(err)?;
        if version>1 { return Err("База создана более новой версией приложения".into()); }
        if version==0 { conn.execute_batch(include_str!("../migrations/001_initial.sql")).map_err(err)?; }
        let mut store=Self { conn };
        let initialized: i64=store.conn.query_row("SELECT COUNT(*) FROM meta WHERE key='settings'",[],|r|r.get(0)).map_err(err)?;
        if initialized==0 { store.save(&seed())?; }
        Ok(store)
    }
    pub fn load(&self) -> Result<Value> {
        let mut data=json!({"schema":1});
        for kind in KINDS {
            let mut stmt=self.conn.prepare("SELECT data FROM records WHERE kind=? ORDER BY rowid").map_err(err)?;
            let strings=stmt.query_map([kind],|r|r.get::<_,String>(0)).map_err(err)?;
            let mut rows=Vec::new(); for s in strings { rows.push(serde_json::from_str::<Value>(&s.map_err(err)?).map_err(err)?); }
            data[kind]=json!(rows);
        }
        let settings: String=self.conn.query_row("SELECT value FROM meta WHERE key='settings'",[],|r|r.get(0)).map_err(err)?;
        data["settings"]=serde_json::from_str(&settings).map_err(err)?;
        validate(&data)?; Ok(data)
    }
    pub fn save(&mut self, data: &Value) -> Result<()> {
        validate(data)?;
        let tx=self.conn.transaction().map_err(err)?;
        tx.execute("DELETE FROM records",[]).map_err(err)?;
        for kind in KINDS { for row in data[kind].as_array().unwrap() { tx.execute("INSERT INTO records(kind,id,data) VALUES(?,?,?)",params![kind,row["id"].as_str().unwrap(),row.to_string()]).map_err(err)?; } }
        tx.execute("INSERT OR REPLACE INTO meta(key,value) VALUES('settings',?)",[data["settings"].to_string()]).map_err(err)?;
        tx.commit().map_err(err)
    }
    pub fn due(&self, now: chrono::DateTime<chrono::Utc>) -> Result<Vec<Value>> {
        let data=self.load()?; let mut result=vec![];
        for r in data["reminders"].as_array().unwrap() {
            if r["enabled"]!=true { continue; }
            let at=DateTime::parse_from_rfc3339(r["at"].as_str().unwrap()).map_err(err)?;
            let sent:i64=self.conn.query_row("SELECT COUNT(*) FROM deliveries WHERE id=? AND at=?",params![r["id"].as_str(),r["at"].as_str()],|r|r.get(0)).map_err(err)?;
            if at<=now && sent==0 { result.push(r.clone()); }
        } Ok(result)
    }
    pub fn mark_sent(&self,r:&Value)->Result<()> { self.conn.execute("INSERT OR IGNORE INTO deliveries(id,at) VALUES(?,?)",params![r["id"].as_str(),r["at"].as_str()]).map_err(err)?; Ok(()) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn migration_crud_restart_and_atomic_import() {
        let dir=tempfile::tempdir().unwrap(); let path=dir.path().join("test.sqlite");
        let mut s=Store::open(&path).unwrap(); let mut d=s.load().unwrap();
        assert_eq!(d["tasks"].as_array().unwrap().len(),3);
        d["transactions"]=json!([{ "id":"t","kind":"income","category":"Тест","cents":29,"date":"2026-10-11","notes":"" }]);
        d["projects"]=json!([{ "id":"p","title":"Проект","description":"","deadline":"","status":"active","tasks":[{"id":"pt","title":"Задача","done":false}] }]);
        d["goals"]=json!([{ "id":"g","title":"Цель","deadline":"2026-12-31","unit":"км","target":100,"current":2 }]);
        d["reminders"]=json!([{ "id":"r","title":"Тест","at":"2026-01-01T12:00:00Z","enabled":true }]);
        s.save(&d).unwrap(); drop(s); let mut s=Store::open(&path).unwrap(); assert_eq!(s.load().unwrap(),d);
        for kind in KINDS { if kind=="transactions" { d[kind][0]["notes"]=json!("Изменено"); } else { d[kind][0]["title"]=json!("Изменено"); } }
        s.save(&d).unwrap(); assert_eq!(s.load().unwrap(),d);
        let mut bad=d.clone(); bad["transactions"][0]["cents"]=json!(1.1); assert!(s.save(&bad).is_err()); assert_eq!(s.load().unwrap(),d);
        let serialized=serde_json::to_string(&d).unwrap(); s.save(&serde_json::from_str(&serialized).unwrap()).unwrap();
        for kind in KINDS { d[kind]=json!([]); } s.save(&d).unwrap(); drop(s); assert_eq!(Store::open(&path).unwrap().load().unwrap(),d);
    }
    #[test] fn reminders_survive_restart_without_repeat() {
        let dir=tempfile::tempdir().unwrap(); let path=dir.path().join("r.sqlite"); let mut s=Store::open(&path).unwrap(); let mut d=s.load().unwrap();
        d["reminders"]=json!([{ "id":"r","title":"Тест","at":"2026-01-01T12:00:00Z","enabled":true }]); s.save(&d).unwrap();
        let now=DateTime::parse_from_rfc3339("2026-01-02T12:00:00Z").unwrap().to_utc(); let due=s.due(now).unwrap(); assert_eq!(due.len(),1); s.mark_sent(&due[0]).unwrap(); drop(s);
        let s=Store::open(&path).unwrap(); assert!(s.due(now).unwrap().is_empty());
    }
    #[test] fn rejects_invalid_dates_and_duplicate_ids() { let mut d=seed(); d["tasks"][0]["date"]=json!("2026-02-30"); assert!(validate(&d).is_err()); let mut d=seed(); d["tasks"][1]["id"]=d["tasks"][0]["id"].clone(); assert!(validate(&d).is_err()); }
}
