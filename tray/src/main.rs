// 翱翔选课助手 · Windows 托盘壳
// 职责：后台启动 CourseHelper.exe（隐藏窗口）→ 显示「正在启动」小窗 → 服务就绪后打开网页
//       → 常驻托盘，右键菜单「打开网站 / 退出」。图标内嵌自 favicon.png，小窗底图内嵌自 splash.png。
// 仅 Windows 编译（使用 std::os::windows 与 cmd）。

// GUI 子系统：双击运行时不弹出控制台窗口
#![windows_subsystem = "windows"]

mod icon;
mod splash;

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use tao::dpi::{LogicalSize, PhysicalPosition};
use tao::event::{Event, WindowEvent};
use tao::event_loop::{ControlFlow, EventLoopBuilder};
use tao::window::{Icon as WindowIcon, Window, WindowBuilder};
use tray_icon::menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tray_icon::{Icon, TrayIconBuilder, TrayIconEvent};

const DEFAULT_PORT: u16 = 3001;
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
// 单实例锁端口：托盘启动时绑定它，绑定失败说明已有一份在运行。
const LOCK_PORT: u16 = 30000;

enum UserEvent {
    TrayIconEvent(TrayIconEvent),
    MenuEvent(MenuEvent),
    ServerReady(u16),
    ServerFailed,
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

// 数据目录与后端一致：Windows 用 %APPDATA%\CourseHelper，其余环境回退到 exe 同目录 data/。
fn settings_path() -> std::path::PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        std::path::PathBuf::from(appdata)
            .join("CourseHelper")
            .join("settings.json")
    } else {
        exe_dir().join("data").join("settings.json")
    }
}

// 从 settings.json 读上次成功监听的端口（服务端端口被占用自动切换后会写入），失败回退默认。
fn read_port() -> u16 {
    if let Ok(s) = std::fs::read_to_string(settings_path()) {
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

// 探测后端是否就绪：发一个最小 HTTP GET，收到 200 即认为就绪。
fn probe_server(port: u16) -> bool {
    if let Ok(mut s) = TcpStream::connect(("127.0.0.1", port)) {
        let _ = s.set_read_timeout(Some(Duration::from_millis(400)));
        let req = format!(
            "GET /api/settings HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
            port
        );
        if s.write_all(req.as_bytes()).is_ok() {
            let mut buf = [0u8; 256];
            if let Ok(n) = s.read(&mut buf) {
                return buf[..n].starts_with(b"HTTP/1.1 200") || buf[..n].starts_with(b"HTTP/1.0 200");
            }
        }
    }
    false
}

// 轮询等待后端就绪（覆盖 3001..3021 的自动顺延端口），超时返回 None。
fn wait_until_ready(start_port: u16, timeout: Duration) -> Option<u16> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        for p in start_port..start_port.saturating_add(21) {
            if probe_server(p) {
                return Some(p);
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
    None
}

// 把内嵌的 splash.png（RGBA）按窗口物理尺寸绘制到小窗上。
fn draw_splash(window: &Window) {
    let Ok(context) = softbuffer::Context::new(window) else {
        return;
    };
    let Ok(mut surface) = softbuffer::Surface::new(&context, window) else {
        return;
    };
    let size = window.inner_size();
    let w = size.width.max(1);
    let h = size.height.max(1);
    if surface
        .resize(
            std::num::NonZeroU32::new(w).unwrap(),
            std::num::NonZeroU32::new(h).unwrap(),
        )
        .is_err()
    {
        return;
    }
    let Ok(mut buffer) = surface.buffer_mut() else {
        return;
    };
    for y in 0..h {
        for x in 0..w {
            let sx = (x as usize * splash::SPLASH_W) / (w as usize);
            let sy = (y as usize * splash::SPLASH_H) / (h as usize);
            let i = (sy * splash::SPLASH_W + sx) * 4;
            let r = splash::SPLASH_RGBA[i] as u32;
            let g = splash::SPLASH_RGBA[i + 1] as u32;
            let b = splash::SPLASH_RGBA[i + 2] as u32;
            let a = splash::SPLASH_RGBA[i + 3] as u32;
            // 合成到白色背景（splash.png 本身不透明，这里仍做兜底合成）
            let r = (r * a + 255 * (255 - a)) / 255;
            let g = (g * a + 255 * (255 - a)) / 255;
            let b = (b * a + 255 * (255 - a)) / 255;
            buffer[(y * w + x) as usize] = (r << 16) | (g << 8) | b;
        }
    }
    let _ = buffer.present();
}

// 无边框、置顶、居中、不可调整大小的启动小窗。
fn build_splash_window(event_loop: &tao::event_loop::EventLoop<UserEvent>) -> Window {
    let icon =
        WindowIcon::from_rgba(icon::ICON_RGBA.to_vec(), icon::ICON_SIZE, icon::ICON_SIZE).ok();
    let window = WindowBuilder::new()
        .with_title("翱翔选课助手")
        .with_inner_size(LogicalSize::new(
            splash::SPLASH_W as f64,
            splash::SPLASH_H as f64,
        ))
        .with_decorations(false)
        .with_always_on_top(true)
        .with_resizable(false)
        .with_maximizable(false)
        .with_minimizable(false)
        .with_visible(false)
        .with_window_icon(icon)
        .build(event_loop)
        .expect("创建启动小窗失败");

    // 居中显示
    if let Some(monitor) = window.current_monitor() {
        let ms = monitor.size();
        let ws = window.outer_size();
        let _ = window.set_outer_position(PhysicalPosition::new(
            (ms.width as i32 - ws.width as i32) / 2,
            (ms.height as i32 - ws.height as i32) / 2,
        ));
    }

    draw_splash(&window);
    window.set_visible(true);
    window.request_redraw();
    window
}

fn main() {
    // 0) 多开限制：用固定本地端口当单实例锁；绑定失败=已运行 → 只打开网页并退出。
    //    锁对象保持到进程结束，退出时由 OS 自动释放端口。
    let _lock = match TcpListener::bind(("127.0.0.1", LOCK_PORT)) {
        Ok(l) => l,
        Err(_) => {
            open_browser(read_port());
            std::process::exit(0);
        }
    };

    // 1) 后端可执行文件存在性检查
    let server_path = exe_dir().join("CourseHelper.exe");
    if !server_path.exists() {
        eprintln!("未找到 CourseHelper.exe，请把它与本程序放在同一目录。");
        std::process::exit(1);
    }

    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();

    // 2) 启动后端（隐藏窗口，不占任务栏）
    let mut server = Command::new(&server_path)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
        .expect("启动 CourseHelper.exe 失败");

    // 3) 显示「正在启动」小窗（无边框置顶，展示名称 + 图标）
    let mut splash: Option<Window> = Some(build_splash_window(&event_loop));

    // 4) 健康检查线程：服务就绪后关小窗、开网页（替代原来的固定 sleep 1.5s）
    let hc_proxy = event_loop.create_proxy();
    thread::spawn(move || {
        let result = wait_until_ready(read_port(), Duration::from_secs(15));
        match result {
            Some(port) => {
                let _ = hc_proxy.send_event(UserEvent::ServerReady(port));
            }
            None => {
                let _ = hc_proxy.send_event(UserEvent::ServerFailed);
            }
        }
    });

    // 5) 托盘事件
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
                        .with_tooltip("翱翔选课助手")
                        .with_icon(icon)
                        .build()
                        .expect("创建托盘图标失败"),
                );
            }
            Event::RedrawRequested(_) => {
                if let Some(w) = &splash {
                    draw_splash(w);
                }
            }
            Event::WindowEvent {
                event: WindowEvent::Resized(_),
                ..
            } => {
                if let Some(w) = &splash {
                    draw_splash(w);
                }
            }
            Event::UserEvent(UserEvent::ServerReady(port)) => {
                if splash.take().is_some() {
                    open_browser(port);
                }
            }
            Event::UserEvent(UserEvent::ServerFailed) => {
                if splash.take().is_some() {
                    open_browser(read_port());
                }
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
