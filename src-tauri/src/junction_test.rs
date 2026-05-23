#[cfg(test)]
mod junction_test {
    use std::fs;

    #[test]
    fn create_and_delete_junction() {
        let base = std::env::temp_dir().join(format!(
            "junction-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let target = base.join("target");
        let link = base.join("link");

        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("hello.txt"), "world").unwrap();

        // Create junction using the junction crate
        junction::create(&target, &link).expect("junction creation should succeed");

        // Verify the junction resolves to the target
        assert!(link.join("hello.txt").exists(), "junction should resolve to target");

        // Verify fs::read_link works on junctions
        let _read_target = fs::read_link(&link).unwrap();

        // Delete with remove_dir (junctions don't need admin)
        fs::remove_dir(&link).unwrap();
        assert!(!link.exists(), "junction should be removed");
        assert!(target.exists(), "target should still exist");

        // Cleanup
        fs::remove_dir_all(&base).unwrap();
    }
}
