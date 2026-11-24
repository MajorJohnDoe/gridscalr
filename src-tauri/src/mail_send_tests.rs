use super::*;
use crate::mail_launch::{
    explorer_select_plan, finder_reveal_plan, folder_reveal_plan, osascript_plan, outlook_plan,
    thunderbird_compose_value, thunderbird_plan, xdg_email_plan,
};
use std::fs;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDir(PathBuf);

impl TestDir {
    fn new() -> Self {
        let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
        let stamp = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or(0);
        let path = std::env::temp_dir().join(format!(
            "gridscalr-mail-{}-{counter}-{stamp}",
            std::process::id()
        ));
        fs::create_dir_all(&path).expect("create test directory");
        Self(path)
    }

    fn outbox(&self) -> PathBuf {
        let outbox = self.0.join(OUTBOX_FOLDER);
        fs::create_dir_all(&outbox).expect("create outbox");
        outbox
    }

    fn file(&self, name: &str) -> PathBuf {
        self.0.join(name)
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn error_code(result: Result<(), CommandError>) -> &'static str {
    result.expect_err("expected a refusal").code
}

#[test]
fn builds_a_safe_pdf_leaf_name() {
    assert_eq!(safe_pdf_file_name("Plan.pdf"), "Plan.pdf");
    assert_eq!(safe_pdf_file_name("../../Plan.pdf"), "Plan.pdf");
    assert_eq!(safe_pdf_file_name("a b?.pdf"), "a_b.pdf");
    assert_eq!(safe_pdf_file_name("drawing.txt"), "drawing.pdf");
    assert_eq!(safe_pdf_file_name(""), "drawing.pdf");
    assert_eq!(safe_pdf_file_name(".."), "drawing.pdf");
}

#[test]
fn keeps_the_attachment_limit_at_the_boundary() {
    assert!(ensure_compose_size(MAX_COMPOSE_BYTES).is_ok());
    assert_eq!(
        ensure_compose_size(MAX_COMPOSE_BYTES + 1)
            .expect_err("over the limit")
            .code,
        "mailTooLarge"
    );
}

#[test]
fn guards_a_file_inside_the_outbox() {
    let directory = TestDir::new();
    let outbox = directory.outbox();
    let inside = outbox.join("plan.pdf");
    fs::write(&inside, b"pdf").expect("write attachment");
    assert!(guard_export(&outbox, &inside).is_ok());
}

#[test]
fn refuses_a_file_outside_the_outbox() {
    let directory = TestDir::new();
    let outbox = directory.outbox();
    let outside = directory.file("Plan.pdf");
    fs::write(&outside, b"source").expect("write source");
    assert_eq!(
        error_code(guard_export(&outbox, &outside)),
        "mailOutsideOutbox"
    );
}

#[test]
fn refuses_a_wrong_extension_and_a_missing_file() {
    let directory = TestDir::new();
    let outbox = directory.outbox();
    let text = outbox.join("notes.txt");
    fs::write(&text, b"text").expect("write text");
    assert_eq!(error_code(guard_export(&outbox, &text)), "mailNotPdf");
    assert_eq!(
        error_code(guard_export(&outbox, &outbox.join("missing.pdf"))),
        "mailFileMissing"
    );
}

#[cfg(unix)]
#[test]
fn refuses_a_symlink_that_escapes_the_outbox() {
    use std::os::unix::fs::symlink;

    let directory = TestDir::new();
    let outbox = directory.outbox();
    let source = directory.file("source.pdf");
    fs::write(&source, b"source").expect("write source");
    let link = outbox.join("escape.pdf");
    symlink(&source, &link).expect("create symlink");
    assert_eq!(
        error_code(guard_export(&outbox, &link)),
        "mailOutsideOutbox"
    );
}

#[test]
fn prunes_the_outbox_to_the_newest_ten_pdfs() {
    let directory = TestDir::new();
    let outbox = directory.outbox();
    for index in 0..12 {
        fs::write(outbox.join(format!("mail-{index:02}.pdf")), b"pdf").expect("write attachment");
    }
    fs::write(outbox.join("notes.txt"), b"text").expect("write unrelated file");
    assert_eq!(prune_outbox(&outbox, OUTBOX_KEEP), 2);
    let remaining = fs::read_dir(&outbox)
        .expect("read outbox")
        .flatten()
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .to_ascii_lowercase()
                .ends_with(".pdf")
        })
        .count();
    assert_eq!(remaining, OUTBOX_KEEP);
    assert!(outbox.join("notes.txt").exists());
}

#[test]
fn names_the_attachment_as_its_own_xdg_email_argument() {
    let plan = xdg_email_plan(Path::new("/tmp/mail-outbox/Plan.pdf"), "Plan", "Body");
    assert_eq!(plan.program, "xdg-email");
    assert_eq!(
        plan.args,
        vec![
            "--subject",
            "Plan",
            "--body",
            "Body",
            "--attach",
            "/tmp/mail-outbox/Plan.pdf",
        ]
    );
}

#[test]
fn passes_the_macos_arguments_after_the_script() {
    let plan = osascript_plan(Path::new("/tmp/outbox/Plan.pdf"), "Subject", "Body");
    assert_eq!(plan.program, "osascript");
    let split = plan
        .args
        .iter()
        .position(|argument| argument == "--")
        .expect("argument separator");
    assert_eq!(
        &plan.args[split + 1..],
        &["/tmp/outbox/Plan.pdf", "Subject", "Body"]
    );
    let script = plan.args[..split].join("\n");
    assert!(script.contains("make new outgoing message"));
    assert!(script.contains("visible:true"));
    assert!(!script.contains("/tmp/outbox/Plan.pdf"));
}

#[test]
fn sanitizes_the_thunderbird_compose_value() {
    assert_eq!(
        thunderbird_compose_value("A, B's \"plan\"\nnext"),
        "A B s plan next"
    );
    let plan = thunderbird_plan(Path::new("/tmp/outbox/Plan.pdf"), "S", "B");
    assert_eq!(plan.program, "thunderbird");
    assert_eq!(plan.args[0], "-compose");
    assert!(plan.args[1].starts_with("attachment='/tmp/outbox/Plan.pdf'"));
    assert!(plan.args[1].contains("subject='S'"));
}

#[test]
fn builds_the_windows_fallback_and_reveal_arguments() {
    let outlook = outlook_plan(Path::new("C:/outbox/Plan.pdf"));
    assert_eq!(outlook.program, "outlook.exe");
    assert_eq!(outlook.args, vec!["/a", "C:/outbox/Plan.pdf"]);

    let explorer = explorer_select_plan(Path::new("C:/outbox/Plan.pdf"));
    assert_eq!(explorer.program, "explorer.exe");
    assert_eq!(explorer.args, vec!["/select,", "C:/outbox/Plan.pdf"]);

    let finder = finder_reveal_plan(Path::new("/tmp/outbox/Plan.pdf"));
    assert_eq!(finder.program, "open");
    assert_eq!(finder.args, vec!["-R", "/tmp/outbox/Plan.pdf"]);

    let folder = folder_reveal_plan(Path::new("/tmp/outbox/Plan.pdf"));
    assert_eq!(folder.program, "xdg-open");
    assert_eq!(folder.args, vec!["/tmp/outbox"]);
}

#[test]
fn serializes_the_structured_outcome_names() {
    assert_eq!(
        serde_json::to_value(ComposeStatus::Draft).expect("serialize"),
        "draft"
    );
    assert_eq!(
        serde_json::to_value(ComposeStatus::NoClient).expect("serialize"),
        "no_client"
    );
    assert_eq!(
        serde_json::to_value(ComposeStatus::Failed).expect("serialize"),
        "failed"
    );
}
