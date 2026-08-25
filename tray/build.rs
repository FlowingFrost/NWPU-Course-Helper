// 构建脚本：把 tray/icon.ico 嵌入 Windows exe 的资源，使 exe 文件本身也有图标。
fn main() {
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "windows" {
        let mut res = winres::WindowsResource::new();
        res.set_icon("icon.ico");
        res.compile().expect("嵌入 exe 图标失败");
    }
}
