//! Local mail-client launch strategies for the exported drawing PDF.
//!
//! Every strategy is a program plus an argument array; no shell string and no
//! interpolation. The builders are platform-neutral and unit-tested, while the
//! launchers compile only on their target.

use std::io::ErrorKind;
use std::path::Path;
use std::process::Stdio;

use crate::mail_send::ComposeStatus;

/// One program and its literal arguments. Building a plan never touches a shell.
#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct LaunchPlan {
    pub program: String,
    pub args: Vec<String>,
}

#[derive(Debug)]
pub(crate) enum LaunchFailure {
    NotFound,
    Exited(String),
}

fn plan(program: &str, args: Vec<String>) -> LaunchPlan {
    LaunchPlan {
        program: program.to_string(),
        args,
    }
}

fn path_text(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// `xdg-email` with the attachment as its own argument.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn xdg_email_plan(file: &Path, subject: &str, body: &str) -> LaunchPlan {
    plan(
        "xdg-email",
        vec![
            "--subject".to_string(),
            subject.to_string(),
            "--body".to_string(),
            body.to_string(),
            "--attach".to_string(),
            path_text(file),
        ],
    )
}

/// Thunderbird's `-compose` value is one argument. Quotes, commas and line
/// breaks are removed so the value cannot split into another field.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn thunderbird_compose_value(value: &str) -> String {
    let cleaned: String = value
        .chars()
        .map(|character| match character {
            '\'' | '"' | ',' | '\n' | '\r' => ' ',
            other => other,
        })
        .collect();
    cleaned.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn thunderbird_plan(file: &Path, subject: &str, body: &str) -> LaunchPlan {
    let compose = format!(
        "attachment='{}',subject='{}',body='{}'",
        thunderbird_compose_value(&path_text(file)),
        thunderbird_compose_value(subject),
        thunderbird_compose_value(body)
    );
    plan("thunderbird", vec!["-compose".to_string(), compose])
}

/// Outlook's attachment switch, used when Simple MAPI is unavailable.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn outlook_plan(file: &Path) -> LaunchPlan {
    plan("outlook.exe", vec!["/a".to_string(), path_text(file)])
}

/// A visible, unsent Mail.app draft. The path, subject and body arrive as
/// `run` arguments, never inside the AppleScript source.
#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn osascript_plan(file: &Path, subject: &str, body: &str) -> LaunchPlan {
    let script = [
        "on run argv",
        "set theFile to POSIX file (item 1 of argv)",
        "set theSubject to item 2 of argv",
        "set theBody to item 3 of argv",
        "tell application \"Mail\"",
        "activate",
        "set draftMessage to make new outgoing message with properties {subject:theSubject, content:theBody, visible:true}",
        "tell draftMessage to make new attachment with properties {file name:theFile} at after the last paragraph",
        "end tell",
        "end tell",
        "end run",
    ];
    let mut args = Vec::with_capacity(script.len() * 2 + 4);
    for line in script {
        args.push("-e".to_string());
        args.push(line.to_string());
    }
    args.push("--".to_string());
    args.push(path_text(file));
    args.push(subject.to_string());
    args.push(body.to_string());
    plan("osascript", args)
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn explorer_select_plan(file: &Path) -> LaunchPlan {
    plan(
        "explorer.exe",
        vec!["/select,".to_string(), path_text(file)],
    )
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn finder_reveal_plan(file: &Path) -> LaunchPlan {
    plan("open", vec!["-R".to_string(), path_text(file)])
}

#[cfg_attr(not(test), allow(dead_code))]
pub(crate) fn folder_reveal_plan(file: &Path) -> LaunchPlan {
    let folder = file
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty());
    plan("xdg-open", vec![path_text(folder.unwrap_or(file))])
}

#[cfg_attr(not(test), allow(dead_code))]
fn run_to_completion(plan: &LaunchPlan) -> Result<(), LaunchFailure> {
    let output = std::process::Command::new(&plan.program)
        .args(&plan.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output();
    match output {
        Ok(output) if output.status.success() => Ok(()),
        Ok(output) => Err(LaunchFailure::Exited(
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        )),
        Err(error) if error.kind() == ErrorKind::NotFound => Err(LaunchFailure::NotFound),
        Err(error) => Err(LaunchFailure::Exited(error.to_string())),
    }
}

/// A client that stays open must not keep the Tauri command waiting, so a
/// successful spawn counts as handed off.
fn spawn_detached(plan: &LaunchPlan) -> Result<(), LaunchFailure> {
    match std::process::Command::new(&plan.program)
        .args(&plan.args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::NotFound => Err(LaunchFailure::NotFound),
        Err(error) => Err(LaunchFailure::Exited(error.to_string())),
    }
}

fn failure_outcome(failure: LaunchFailure, fallback: &str) -> (ComposeStatus, String) {
    match failure {
        LaunchFailure::NotFound => (ComposeStatus::NoClient, fallback.to_string()),
        LaunchFailure::Exited(detail) if detail.is_empty() => {
            (ComposeStatus::Failed, fallback.to_string())
        }
        LaunchFailure::Exited(detail) => (ComposeStatus::Failed, detail),
    }
}

#[cfg(target_os = "windows")]
fn windows_launch(file: &Path, subject: &str, body: &str) -> (ComposeStatus, String) {
    let detail = match send_with_mapi(file, subject, body) {
        Ok(()) => return (ComposeStatus::Draft, "Simple MAPI".to_string()),
        Err(error) => error,
    };
    let fallback = outlook_plan(file);
    match spawn_detached(&fallback) {
        Ok(()) => (ComposeStatus::Draft, format!("outlook.exe /a ({detail})")),
        Err(failure) => failure_outcome(failure, &detail),
    }
}

#[cfg(target_os = "macos")]
fn macos_launch(file: &Path, subject: &str, body: &str) -> (ComposeStatus, String) {
    match run_to_completion(&osascript_plan(file, subject, body)) {
        Ok(()) => (ComposeStatus::Draft, "Mail.app".to_string()),
        Err(LaunchFailure::NotFound) => (ComposeStatus::NoClient, "osascript missing".to_string()),
        Err(LaunchFailure::Exited(detail)) => {
            let lower = detail.to_lowercase();
            let missing = lower.contains("isn't running")
                || lower.contains("isn’t running")
                || lower.contains("can't get application")
                || lower.contains("can’t get application")
                || lower.contains("application not found");
            let status = if missing {
                ComposeStatus::NoClient
            } else {
                ComposeStatus::Failed
            };
            (status, detail)
        }
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn linux_launch(file: &Path, subject: &str, body: &str) -> (ComposeStatus, String) {
    match run_to_completion(&xdg_email_plan(file, subject, body)) {
        Ok(()) => return (ComposeStatus::Draft, "xdg-email".to_string()),
        Err(failure) => {
            let detail = match failure {
                LaunchFailure::NotFound => "xdg-email missing".to_string(),
                LaunchFailure::Exited(text) if text.is_empty() => "xdg-email failed".to_string(),
                LaunchFailure::Exited(text) => text,
            };
            let fallback = thunderbird_plan(file, subject, body);
            match spawn_detached(&fallback) {
                Ok(()) => (
                    ComposeStatus::Draft,
                    format!("thunderbird -compose ({detail})"),
                ),
                Err(failure) => failure_outcome(failure, "no local mail client"),
            }
        }
    }
}

pub(crate) fn launch_mail(file: &Path, subject: &str, body: &str) -> (ComposeStatus, String) {
    #[cfg(target_os = "windows")]
    {
        windows_launch(file, subject, body)
    }
    #[cfg(target_os = "macos")]
    {
        macos_launch(file, subject, body)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        linux_launch(file, subject, body)
    }
    #[cfg(not(any(unix, windows)))]
    {
        let _ = (file, subject, body);
        (ComposeStatus::NoClient, "unsupported platform".to_string())
    }
}

pub(crate) fn reveal_plan(file: &Path) -> LaunchPlan {
    #[cfg(target_os = "windows")]
    {
        explorer_select_plan(file)
    }
    #[cfg(target_os = "macos")]
    {
        finder_reveal_plan(file)
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        folder_reveal_plan(file)
    }
    #[cfg(not(any(unix, windows)))]
    {
        folder_reveal_plan(file)
    }
}

/// Reveals one guarded outbox file in the OS file manager.
pub(crate) fn reveal_file(file: &Path) -> Result<(), LaunchFailure> {
    spawn_detached(&reveal_plan(file))
}

#[cfg(windows)]
fn send_with_mapi(file: &Path, subject: &str, body: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::FreeLibrary;
    use windows_sys::Win32::System::LibraryLoader::{GetProcAddress, LoadLibraryW};
    use windows_sys::Win32::System::Mapi::{
        MapiFileDescW, MapiMessageW, MAPI_DIALOG, MAPI_E_USER_ABORT, MAPI_LOGON_UI, SUCCESS_SUCCESS,
    };

    // Resolve at runtime instead of through an import library: MAPI32.dll is a
    // system component, and the SDK import library does not export the Unicode
    // entry point on every toolchain. A missing entry point falls back to
    // Outlook; it never becomes a load-time failure for the whole app.
    type MapiSendMailW =
        unsafe extern "system" fn(usize, usize, *const MapiMessageW, u32, u32) -> u32;

    let module_name: Vec<u16> = "mapi32.dll\0".encode_utf16().collect();
    let module = unsafe { LoadLibraryW(module_name.as_ptr()) };
    if module.is_null() {
        return Err("mapi32.dll unavailable".to_string());
    }
    let Some(procedure) = (unsafe { GetProcAddress(module, c"MAPISendMailW".as_ptr().cast()) })
    else {
        unsafe { FreeLibrary(module) };
        return Err("MAPISendMailW unavailable".to_string());
    };
    let send_mail: MapiSendMailW = unsafe { std::mem::transmute(procedure) };

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(std::iter::once(0)).collect()
    }

    let mut path: Vec<u16> = file
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let attachment_name = file
        .file_name()
        .unwrap_or_else(|| std::ffi::OsStr::new("drawing.pdf"));
    let mut name = wide(&attachment_name.to_string_lossy());
    let mut subject_wide = wide(subject);
    let mut body_wide = wide(body);
    let mut attachment = MapiFileDescW {
        ulReserved: 0,
        flFlags: 0,
        nPosition: u32::MAX,
        lpszPathName: path.as_mut_ptr(),
        lpszFileName: name.as_mut_ptr(),
        lpFileType: std::ptr::null_mut(),
    };
    let message = MapiMessageW {
        ulReserved: 0,
        lpszSubject: subject_wide.as_mut_ptr(),
        lpszNoteText: body_wide.as_mut_ptr(),
        lpszMessageType: std::ptr::null_mut(),
        lpszDateReceived: std::ptr::null_mut(),
        lpszConversationID: std::ptr::null_mut(),
        flFlags: 0,
        lpOriginator: std::ptr::null_mut(),
        nRecipCount: 0,
        lpRecips: std::ptr::null_mut(),
        nFileCount: 1,
        lpFiles: &mut attachment,
    };
    let code = unsafe { send_mail(0, 0, &message, MAPI_LOGON_UI | MAPI_DIALOG, 0) };
    unsafe { FreeLibrary(module) };
    if code == SUCCESS_SUCCESS || code == MAPI_E_USER_ABORT {
        Ok(())
    } else {
        Err(format!("MAPI error {code}"))
    }
}
