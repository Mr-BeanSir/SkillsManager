# Use SQLite for application state

Skills Manager will store its core application state in SQLite instead of a single `skills-manager.json` file because installed Skills, Skill Links, Custom Directories, Skill Groups, Project Roots, and CLI targets are independent but related entities. SQLite avoids rewriting large JSON objects as link counts grow, gives the app uniqueness constraints and relational deletes for reconcile and cleanup workflows, and keeps global, custom, and project link state queryable without duplicating configuration into every Skill record.
