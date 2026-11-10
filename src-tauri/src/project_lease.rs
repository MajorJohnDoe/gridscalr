use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::commands::{replace_file, sync_directory, unique_sibling, write_flushed};
use crate::project_write::WriteError;

/// An advisory sidecar lease for one open project. The lease is a warning, not
/// the safety mechanism: the conditional write in `project_write` remains the
/// guarantee. It never contains a user name, host name or project content.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectLease {
    pub instance_id: String,
    pub project_id: String,
    pub opened_at: i64,
    pub heartbeat_at: i64,
    pub project_sha256: String,
    pub host_label: String,
    pub app_version: String,
}

/// The result of reading a lease file. A corrupt lease is reported instead of
/// blocking the open flow; the frontend treats it as information only.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaseRead {
    pub lease: Option<ProjectLease>,
    pub corrupt: bool,
}

fn lease_path(project_path: &Path) -> PathBuf {
    let mut name = project_path.as_os_str().to_os_string();
    name.push(".lock");
    PathBuf::from(name)
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "project.gridscalr.lock".to_string())
}

fn read_lease(path: &Path) -> Result<LeaseRead, WriteError> {
    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str::<ProjectLease>(&text) {
            Ok(lease) => Ok(LeaseRead {
                lease: Some(lease),
                corrupt: false,
            }),
            Err(_) => Ok(LeaseRead {
                lease: None,
                corrupt: true,
            }),
        },
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(LeaseRead {
            lease: None,
            corrupt: false,
        }),
        Err(error) => Err(WriteError::new(
            "leaseReadFailed",
            format!("{}: {error}", path.display()),
        )),
    }
}

/// Writes a lease through a flushed temporary file and a single rename. A
/// takeover replaces the existing lease atomically; it never truncates it.
fn write_lease(path: &Path, lease: &ProjectLease) -> Result<(), WriteError> {
    let parent = match path.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent.to_path_buf(),
        _ => PathBuf::from("."),
    };
    fs::create_dir_all(&parent).map_err(|error| {
        WriteError::new(
            "createFolderFailed",
            format!("{}: {error}", display_name(path)),
        )
    })?;
    let data = serde_json::to_vec_pretty(lease).map_err(|error| {
        WriteError::new(
            "leaseWriteFailed",
            format!("{}: {error}", display_name(path)),
        )
    })?;
    let temp = unique_sibling(path, "lock-tmp");
    if let Err(error) = write_flushed(&temp, &data) {
        let _ = fs::remove_file(&temp);
        return Err(WriteError::new(
            "leaseWriteFailed",
            format!("{}: {error}", display_name(path)),
        ));
    }
    if let Err(error) = replace_file(&temp, path, &display_name(path)) {
        return Err(WriteError::from(error));
    }
    sync_directory(&parent);
    Ok(())
}

#[tauri::command]
pub fn read_project_lease(path: String) -> Result<LeaseRead, WriteError> {
    read_lease(&lease_path(Path::new(&path)))
}

/// Acquires a lease or replaces a stale/corrupt one. Takeover is an explicit
/// user decision in the frontend; this command only performs the atomic write.
#[tauri::command]
pub fn write_project_lease(path: String, lease: ProjectLease) -> Result<LeaseRead, WriteError> {
    let target = lease_path(Path::new(&path));
    write_lease(&target, &lease)?;
    Ok(LeaseRead {
        lease: Some(lease),
        corrupt: false,
    })
}

fn heartbeat_lease(
    target: &Path,
    instance_id: &str,
    heartbeat_at: i64,
) -> Result<LeaseRead, WriteError> {
    let read = read_lease(target)?;
    if read.corrupt {
        return Ok(read);
    }
    let Some(mut lease) = read.lease else {
        return Ok(LeaseRead {
            lease: None,
            corrupt: false,
        });
    };
    if lease.instance_id != instance_id {
        return Err(WriteError::new(
            "leaseOwnedElsewhere",
            "another instance owns the project lease",
        ));
    }
    lease.heartbeat_at = heartbeat_at;
    write_lease(target, &lease)?;
    Ok(LeaseRead {
        lease: Some(lease),
        corrupt: false,
    })
}

fn clear_lease(target: &Path, instance_id: &str, force: bool) -> Result<bool, WriteError> {
    if force {
        match fs::remove_file(target) {
            Ok(()) => return Ok(true),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(true),
            Err(error) => {
                return Err(WriteError::new(
                    "leaseClearFailed",
                    format!("{}: {error}", target.display()),
                ))
            }
        }
    }
    let read = read_lease(target)?;
    if read.corrupt {
        return Ok(false);
    }
    let Some(lease) = read.lease else {
        return Ok(true);
    };
    if lease.instance_id != instance_id {
        return Ok(false);
    }
    match fs::remove_file(target) {
        Ok(()) => Ok(true),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(error) => Err(WriteError::new(
            "leaseClearFailed",
            format!("{}: {error}", target.display()),
        )),
    }
}

/// Refreshes the heartbeat only while this instance still owns the lease. A
/// mismatch is reported so the old instance can stop writing and stay visible.
#[tauri::command]
pub fn heartbeat_project_lease(
    path: String,
    instance_id: String,
    heartbeat_at: i64,
) -> Result<LeaseRead, WriteError> {
    heartbeat_lease(&lease_path(Path::new(&path)), &instance_id, heartbeat_at)
}

/// Removes the lease only when this instance owns it. `force` is the explicit
/// **Clear stale lock** action; a live lease owned by another instance is never
/// removed without it.
#[tauri::command]
pub fn clear_project_lease(
    path: String,
    instance_id: String,
    force: bool,
) -> Result<bool, WriteError> {
    clear_lease(&lease_path(Path::new(&path)), &instance_id, force)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir(PathBuf);

    impl TestDir {
        fn new() -> Self {
            let counter = COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "gridscalr-project-lease-test-{}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test directory");
            Self(path)
        }

        fn project(&self) -> PathBuf {
            self.0.join("plan.gridscalr")
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn lease(instance: &str, heartbeat: i64) -> ProjectLease {
        ProjectLease {
            instance_id: instance.to_string(),
            project_id: "project-1".to_string(),
            opened_at: 1_000,
            heartbeat_at: heartbeat,
            project_sha256: "abc".to_string(),
            host_label: "Desktop".to_string(),
            app_version: "0.22.4".to_string(),
        }
    }

    #[test]
    fn appends_the_sidecar_suffix_to_the_project_name() {
        assert_eq!(
            lease_path(Path::new("/tmp/plan.gridscalr")),
            PathBuf::from("/tmp/plan.gridscalr.lock")
        );
    }

    #[test]
    fn writes_and_reads_a_lease_atomically() {
        let temp = TestDir::new();
        let project = temp.project();
        let target = lease_path(&project);
        let first = lease("instance-a", 1_000);
        write_lease(&target, &first).expect("write lease");
        let read = read_lease(&target).expect("read lease");
        assert_eq!(read.lease, Some(first));
        assert!(!read.corrupt);
        let names: Vec<String> = fs::read_dir(&temp.0)
            .expect("read directory")
            .map(|entry| entry.unwrap().file_name().to_string_lossy().to_string())
            .collect();
        assert_eq!(names, vec!["plan.gridscalr.lock".to_string()]);
    }

    #[test]
    fn treats_a_corrupt_lease_as_information_not_an_error() {
        let temp = TestDir::new();
        let target = lease_path(&temp.project());
        fs::write(&target, b"{not json").expect("write corrupt lease");
        let read = read_lease(&target).expect("corrupt lease must not fail");
        assert!(read.corrupt);
        assert!(read.lease.is_none());
    }

    #[test]
    fn heartbeat_refreshes_only_while_the_owner_matches() {
        let temp = TestDir::new();
        let target = lease_path(&temp.project());
        write_lease(&target, &lease("instance-a", 1_000)).expect("write lease");

        let read = heartbeat_lease(&target, "instance-a", 2_000).expect("heartbeat");
        assert_eq!(read.lease.expect("lease").heartbeat_at, 2_000);
        let stored = read_lease(&target).expect("read").lease.expect("stored");
        assert_eq!(stored.heartbeat_at, 2_000);

        let error = heartbeat_lease(&target, "instance-b", 3_000).expect_err("mismatch");
        assert_eq!(error.code, "leaseOwnedElsewhere");
        let unchanged = read_lease(&target).expect("read").lease.expect("stored");
        assert_eq!(unchanged.instance_id, "instance-a");
        assert_eq!(unchanged.heartbeat_at, 2_000);
    }

    #[test]
    fn clear_respects_ownership_and_force() {
        let temp = TestDir::new();
        let target = lease_path(&temp.project());
        write_lease(&target, &lease("instance-a", 1_000)).expect("write lease");

        // Wrong owner: keep the other instance's lease.
        assert!(!clear_lease(&target, "instance-b", false).expect("clear"));
        assert!(target.exists());

        // Correct owner: remove it.
        assert!(clear_lease(&target, "instance-a", false).expect("clear"));
        assert!(!target.exists());

        // Missing file counts as already clear.
        assert!(clear_lease(&target, "instance-a", false).expect("clear"));

        // Force removes a foreign lease only through the explicit action.
        write_lease(&target, &lease("instance-a", 1_500)).expect("write lease");
        assert!(clear_lease(&target, "instance-b", true).expect("force clear"));
        assert!(!target.exists());
    }

    #[test]
    fn heartbeat_ignores_a_corrupt_lease_instead_of_rewriting_it() {
        let temp = TestDir::new();
        let target = lease_path(&temp.project());
        fs::write(&target, b"not a lease").expect("write corrupt");
        let read = heartbeat_lease(&target, "instance-a", 2_000).expect("heartbeat");
        assert!(read.corrupt);
        assert_eq!(fs::read_to_string(&target).unwrap(), "not a lease");
    }
}
