fn main() {
    tauri_build::build();

    // tauri-build only passes the Windows Common-Controls v6 manifest resource
    // via `cargo:rustc-link-arg-bins`, leaving `cargo test` binaries without
    // a `.rsrc` manifest so Windows loads comctl32.dll v5.82 (missing TaskDialogIndirect).
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        if let Ok(out_dir) = std::env::var("OUT_DIR") {
            let out_path = std::path::Path::new(&out_dir);
            for candidate in ["libresource.a", "resource.lib"] {
                let res = out_path.join(candidate);
                if res.exists() {
                    println!("cargo:rustc-link-arg={}", res.display());
                    break;
                }
            }
        }
    }
}
