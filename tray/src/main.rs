// 选课助手 · Windows 托盘壳
// 职责：后台启动 CourseHelper.exe（隐藏窗口）→ 默认打开一次网页 → 常驻托盘，
//       右键菜单提供「打开网站 / 退出」。图标内嵌自 favicon.png（见 icon.rs）。
// 仅 Windows 编译（使用 std::os::windows 与 cmd）。

// GUI 子系统：双击运行时不弹出控制台窗口
#![windows_subsystem = "windows"]

mod icon;

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::ptr;
use std::thread;
use std::time::Duration;

use tao::event::Event;
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIconBuilder, TrayIconEvent};
use windows_sys::Win32::Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS, HANDLE};
use windows_sys::Win32::System::Threading::CreateMutexW;

const DEFAULT_PORT: u16 = 3001;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

enum UserEvent {
    TrayIconEvent(TrayIconEvent),
    MenuEvent(MenuEvent),
}

fn exe_dir() -> std::path::PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."))
}

fn open_browser(port: u16) {
    let url = format!("http://localhost:{port}");
    let _ = Command::new("cmd").args(["/C", "start", "", &url]).spawn();
}

// 从 data/settings.json 读上次成功监听的端口（服务端端口被占用自动切换后会写入），失败回退默认。
fn read_port() -> u16 {
    if let Ok(s) = std::fs::read_to_string(exe_dir().join("data").join("settings.json")) {
        if let Some(idx) = s.find("\"port\"") {
            let digits: String = s[idx + 6..]
                .chars()
                .skip_while(|c| !c.is_ascii_digit())
                .take_while(|c| c.is_ascii_digit())
                .collect();
            if let Ok(n) = digits.parse::<u16>() {
                return n;
            }
        }
    }
    DEFAULT_PORT
}

// 单实例互斥体：同名互斥体已存在 → 说明托盘已在运行，多开时只打开网页。
struct SingleInstance {
    handle: HANDLE,
}

impl SingleInstance {
    fn acquire(name: &str) -> Option<Self> {
        let wide: Vec<u16> = OsStr::new(name).encode_wide().chain(std::iter::once(0)).collect();
        unsafe {
            let handle = CreateMutexW(ptr::null(), 0, wide.as_ptr());
            if handle == 0 {
                // 互斥体创建失败：按「未运行」处理，不阻塞正常启动
                return None;
            }
            if GetLastError() == ERROR_ALREADY_EXISTS {
                CloseHandle(handle);
                None
            } else {
                Some(SingleInstance { handle })
            }
        }
    }
}

impl Drop for SingleInstance {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.handle);
        }
    }
}

fn main() {
    // 0) 多开限制：已运行则直接打开网页并退出，不重复启动后端/托盘。
    let _single = match SingleInstance::acquire("CourseHelperTray_SingleInstance") {
        Some(h) => h,
        None => {
            open_browser(read_port());
            std::process::exit(0);
        }
    };

    // 1) 启动后端（隐藏窗口，不占任务栏）
    let server_path = exe_dir().join("CourseHelper.exe");
    if !server_path.exists() {
        eprintln!("未找到 CourseHelper.exe，请把它与本程序放在同一目录。");
        std::process::exit(1);
    }
    let mut server = Command::new(&server_path)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .expect("启动 CourseHelper.exe 失败");

    // 2) 等后端就绪后，默认打开一次网页
    thread::sleep(Duration::from_millis(1500));
    open_browser(read_port());

    // 3) 事件循环 + 托盘
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();

    let proxy = event_loop.create_proxy();
    TrayIconEvent::set_event_handler(Some(move |event| {
        let _ = proxy.send_event(UserEvent::TrayIconEvent(event));
    }));

    let proxy = event_loop.create_proxy();
    MenuEvent::set_event_handler(Some(move |event| {
        let _ = proxy.send_event(UserEvent::MenuEvent(event));
    }));

    let menu = Menu::new();
    let open_item = MenuItem::new("打开网站", true, None);
    let quit_item = MenuItem::new("退出", true, None);
    menu.append(&open_item).ok();
    menu.append(&PredefinedMenuItem::separator()).ok();
    menu.append(&quit_item).ok();

    let mut tray = None;

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::NewEvents(tao::event::StartCause::Init) => {
                let icon = Icon::from_rgba(icon::ICON_RGBA.to_vec(), icon::ICON_SIZE, icon::ICON_SIZE)
                    .expect("加载托盘图标失败");
                tray = Some(
                    TrayIconBuilder::new()
                        .with_menu(Box::new(menu.clone()))
                        .with_tooltip("选课助手")
                        .with_icon(icon)
                        .build()
                        .expect("创建托盘图标失败"),
                );
            }
            Event::UserEvent(UserEvent::TrayIconEvent(_event)) => {
                // 左键点击托盘图标也可打开网页（可选）
            }
            Event::UserEvent(UserEvent::MenuEvent(event)) => {
                if event.id == open_item.id() {
                    open_browser(read_port());
                } else if event.id == quit_item.id() {
                    let _ = server.kill();
                    tray.take();
                    *control_flow = ControlFlow::Exit;
                }
            }
            _ => {}
        }
    });
}
