# Use symbolic links only for Skill Links

Skills Manager will create Skill Links as filesystem symbolic links and will not silently fall back to copied folders or Windows `.lnk` shortcuts when link creation fails. This keeps install, update, delete, and reconcile behavior consistent across global, custom, and project link modes; users must resolve platform permissions such as Windows developer mode or administrator rights when symbolic link creation is unavailable.
