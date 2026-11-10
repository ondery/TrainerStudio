fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|_app| {
            let _child = std::process::Command::new("python")
                .args(["-m", "trainer_studio"])
                .spawn();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Trainer Studio window failed");
}
