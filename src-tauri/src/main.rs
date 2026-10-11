#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod store;
use serde_json::Value;
use std::sync::Mutex;
use tauri::{Manager, Emitter};
use tauri_plugin_notification::NotificationExt;
struct Database(Mutex<store::Store>);
#[tauri::command]
fn load_data(db: tauri::State<Database>) -> Result<Value,String> { db.0.lock().map_err(|e|e.to_string())?.load() }
#[tauri::command]
fn save_data(db: tauri::State<Database>, data: Value) -> Result<(),String> { db.0.lock().map_err(|e|e.to_string())?.save(&data) }
#[tauri::command]
async fn export_backup(app: tauri::AppHandle) -> Result<bool,String> {
    let data=app.state::<Database>().0.lock().map_err(|e|e.to_string())?.load()?;
    let file=rfd::AsyncFileDialog::new().set_file_name(format!("not-give-up-{}.json",chrono::Local::now().format("%Y-%m-%d"))).add_filter("JSON", &["json"]).save_file().await;
    if let Some(file)=file { let bytes=serde_json::to_vec_pretty(&data).map_err(|e|e.to_string())?; std::fs::write(file.path(),bytes).map_err(|e|e.to_string())?; return Ok(true); } Ok(false)
}
#[tauri::command]
async fn read_backup() -> Result<Option<Value>,String> {
    if let Some(file)=rfd::AsyncFileDialog::new().add_filter("JSON", &["json"]).pick_file().await {
        if std::fs::metadata(file.path()).map_err(|e|e.to_string())?.len()>20_000_000 { return Err("Файл больше 20 МБ".into()); }
        let bytes=std::fs::read(file.path()).map_err(|e|e.to_string())?;
        let data:Value=serde_json::from_slice(&bytes).map_err(|e|format!("Неверный JSON: {e}"))?; store::validate(&data)?; Ok(Some(data))
    } else { Ok(None) }
}
#[tauri::command]
fn test_notification(app: tauri::AppHandle) -> Result<(),String> { app.notification().builder().title("Not Give Up").body("Системные напоминания включены. Продолжайте в своём темпе.").show().map_err(|e|e.to_string()) }
fn show(app: &tauri::AppHandle) { if let Some(w)=app.get_webview_window("main") { let _=w.show(); let _=w.unminimize(); let _=w.set_focus(); } }
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app,_,_|show(app)))
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let dir=app.path().app_data_dir()?; std::fs::create_dir_all(&dir)?;
            let db=store::Store::open(&dir.join("not-give-up.sqlite")).map_err(std::io::Error::other)?;
            app.manage(Database(Mutex::new(db)));
            let open=tauri::menu::MenuItem::with_id(app,"open","Открыть Not Give Up",true,None::<&str>)?;
            let exit=tauri::menu::MenuItem::with_id(app,"exit","Выйти",true,None::<&str>)?;
            let menu=tauri::menu::Menu::with_items(app,&[&open,&exit])?;
            let pixels=[174u8,220,105,255].repeat(32*32);
            tauri::tray::TrayIconBuilder::new().icon(tauri::image::Image::new_owned(pixels,32,32)).tooltip("Not Give Up").menu(&menu).on_menu_event(|app,event|match event.id.as_ref() {"open"=>show(app),"exit"=>app.exit(0),_=>{}}).build(app)?;
            let handle=app.handle().clone();
            std::thread::spawn(move || loop {
                let state=handle.state::<Database>();
                match state.0.lock() {
                    Ok(db)=> match db.due(chrono::Utc::now()) {
                        Ok(rows)=>for r in rows { match handle.notification().builder().title("Not Give Up").body(r["title"].as_str().unwrap_or("Напоминание")).show() { Ok(())=> { if let Err(e)=db.mark_sent(&r) { let _=handle.emit("reminder-error",e); } }, Err(e)=> { let _=handle.emit("reminder-error",e.to_string()); } } },
                        Err(e)=>{ let _=handle.emit("reminder-error",e); }
                    },
                    Err(e)=>{ let _=handle.emit("reminder-error",e.to_string()); }
                }
                std::thread::sleep(std::time::Duration::from_secs(15));
            });
            Ok(())
        })
        .on_window_event(|window,event| { if let tauri::WindowEvent::CloseRequested{api,..}=event {
            let state=window.state::<Database>();
            let hide=state.0.lock().ok().and_then(|db|db.load().ok()).map(|d|d["settings"]["closeToTray"]==true).unwrap_or(false);
            if hide { if window.hide().is_ok() { api.prevent_close(); } } else { window.app_handle().exit(0); }
        } })
        .invoke_handler(tauri::generate_handler![load_data,save_data,export_backup,read_backup,test_notification])
        .run(tauri::generate_context!()).expect("Не удалось запустить Not Give Up");
}
