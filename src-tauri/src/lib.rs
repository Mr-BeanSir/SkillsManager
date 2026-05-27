mod app_paths;
mod cli_targets;
mod collections;
mod db;
mod desktop;
mod http;
pub mod domain;
pub mod fs_links;
#[cfg(test)]
mod junction_test;
mod file_import;
mod install;
mod locales;
mod project_cli_targets;
mod project_groups;
mod project_skills;
mod projects;
pub mod reconcile;
mod remote_discovery;
mod repository_sources;
mod settings;
mod skill_files;
mod skill_groups;
mod skill_updates;
mod skills;
mod updater;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};

const TRAY_SHOW_ID: &str = "tray-show";
const TRAY_QUIT_ID: &str = "tray-quit";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let show_item =
                MenuItem::with_id(app, TRAY_SHOW_ID, "Show Skills Manager", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;
            let tray_icon = app
                .default_window_icon()
                .cloned()
                .ok_or_else(|| std::io::Error::other("missing default window icon"))?;

            TrayIconBuilder::with_id("skills-manager-tray")
                .menu(&tray_menu)
                .icon(tray_icon)
                .tooltip("Skills Manager")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    TRAY_SHOW_ID => desktop::show_main_window(app),
                    TRAY_QUIT_ID => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        desktop::show_main_window(&tray.app_handle());
                    }
                })
                .build(app)?;

            // Defer blocking I/O (locales, database) to a background thread so
            // the window appears immediately instead of showing a blank screen
            // while setup finishes.
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                let _ = crate::locales::ensure_locales();

                let silent_start = crate::app_paths::database_path()
                    .ok()
                    .and_then(|path| crate::db::open_database(path).ok())
                    .and_then(|conn| crate::settings::read_settings(&conn).ok())
                    .map(|settings| settings.silent_start)
                    .unwrap_or(false);

                let _ = desktop::apply_startup_window_state(&app_handle, silent_start);
            });

            // Download collection index in a separate background thread
            std::thread::spawn(|| {
                crate::collections::download_collection_index();
            });

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let close_to_tray = crate::app_paths::database_path()
                    .ok()
                    .and_then(|path| crate::db::open_database(path).ok())
                    .and_then(|conn| crate::settings::read_settings(&conn).ok())
                    .map(|settings| settings.close_to_tray)
                    .unwrap_or(true);

                if close_to_tray {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            cli_targets::list_cli_target_records,
            cli_targets::create_cli_target_record,
            cli_targets::update_cli_target_record,
            cli_targets::delete_cli_target_record,
            file_import::check_file_import_record,
            file_import::install_from_file_record,
            locales::read_locale_file,
            install::install_local_fixture_skill,
            project_cli_targets::list_available_cli_target_records,
            project_cli_targets::list_project_cli_target_records,
            project_cli_targets::add_project_cli_target_record,
            project_cli_targets::remove_project_cli_target_record,
            project_groups::list_project_group_records,
            project_groups::add_project_group_record,
            project_groups::enable_project_group_record,
            project_groups::disable_project_group_record,
            project_groups::remove_project_group_record,
            project_skills::list_project_skill_records,
            project_skills::add_project_skill_record,
            project_skills::enable_project_skill_record,
            project_skills::disable_project_skill_record,
            project_skills::remove_project_skill_record,
            projects::list_project_records,
            projects::select_directory,
            projects::create_project_record,
            projects::open_project_directory,
            projects::get_project_record,
            projects::update_project_record,
            projects::delete_project_record,
            remote_discovery::list_remote_skill_records,
            remote_discovery::get_remote_skill_detail_record,
            reconcile::reconcile_project_group_records,
            repository_sources::check_repository_skill_record,
            repository_sources::install_repository_skill_record,
            settings::get_settings_record,
            settings::update_auto_reconcile_record,
            settings::update_discover_page_size_record,
            settings::update_launch_at_startup_record,
            settings::update_silent_start_record,
            settings::update_close_to_tray_record,
            skill_groups::list_skill_group_records,
            skill_groups::create_skill_group_record,
            skill_groups::delete_skill_group_record,
            skill_groups::update_skill_group_record,
            skill_groups::add_skill_to_group_record,
            skill_groups::remove_skill_from_group_record,
            skill_groups::install_collection_group_record,
            skill_groups::update_collection_group_record,
            skill_files::get_skill_detail,
            skill_files::read_skill_file,
            skill_files::write_skill_file,
            skill_updates::check_installed_skill_updates_record,
            skill_updates::check_installed_skill_updates_batch_record,
            skill_updates::update_installed_skill_record,
            skill_updates::update_installed_skills_record,
            skill_updates::update_installed_skills_batch_record,
            skills::list_installed_skill_records,
            skills::delete_installed_skill_record,
            updater::get_app_version,
            updater::check_app_update,
            updater::download_app_update,
            updater::install_update_and_restart,
            collections::list_remote_collections,
            collections::refresh_collection_index_record,
            collections::get_collection_detail_record
        ])
        .run(tauri::generate_context!())
        .expect("error while running Skills Manager");
}
