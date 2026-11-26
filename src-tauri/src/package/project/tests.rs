//! Extracted-project tests: a packaged project may not keep an absolute path or
//! point outside `documents/`.

use std::fs;

use super::validate_extracted_project;
use crate::package::test_support::TestDir;

#[test]
fn rejects_an_extracted_project_with_absolute_or_external_links() {
    let directory = TestDir::new();
    let absolute = directory.file("absolute.gridscalr");
    fs::write(
        &absolute,
        r#"{"documents":[{"path":"/home/ana/Plan.pdf","relativePath":null}]}"#,
    )
    .expect("write absolute project");
    assert!(validate_extracted_project(&absolute).is_err());

    let external = directory.file("external.gridscalr");
    fs::write(
        &external,
        r#"{"documents":[{"path":null,"relativePath":"../Plan.pdf"}]}"#,
    )
    .expect("write external project");
    assert!(validate_extracted_project(&external).is_err());

    let valid = directory.file("valid.gridscalr");
    fs::write(
        &valid,
        r#"{"documents":[{"path":null,"relativePath":"documents/Plan.pdf"}]}"#,
    )
    .expect("write valid project");
    validate_extracted_project(&valid).expect("valid packaged project");
}
