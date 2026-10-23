import os
import sqlite3
import subprocess
import sys
from pathlib import Path


def test_objective_report_migration_preserves_existing_requests_and_reports(tmp_path):
    path = tmp_path / "legacy.db"
    env = {**os.environ, "DATABASE_URL": f"sqlite+aiosqlite:///{path}"}
    backend_dir = Path(__file__).resolve().parents[1]

    def migrate(*args):
        subprocess.run([sys.executable, "-m", "alembic", *args], cwd=backend_dir, env=env, capture_output=True, check=True)

    migrate("upgrade", "e018")
    with sqlite3.connect(path) as db:
        db.execute("INSERT INTO users (id, username, email, password_hash, display_name, role, avatar_url, is_active, created_at, updated_at) VALUES ('u1', 'legacy', 'legacy@example.com', 'x', 'Legacy', 'member', '', 1, '2026-10-23', '2026-10-23')")
        db.execute("INSERT INTO test_requests (id, title, catalog, reporter_id, tester_id, status, created_at, updated_at) VALUES ('t1', 'Legacy request', '## 原目标', 'u1', 'u1', 'passed', '2026-10-23', '2026-10-23')")
        db.execute("INSERT INTO test_runs (id, request_id, tester_id, status, result, created_at) VALUES ('r1', 't1', 'u1', 'passed', '## 历史结论', '2026-10-23')")
        db.execute("INSERT INTO test_attachments (id, request_id, run_id, filename, original_name, created_at) VALUES ('a1', 't1', 'r1', 'log.txt', 'log.txt', '2026-10-23')")
    migrate("upgrade", "head")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT objective FROM test_requests WHERE id='t1'").fetchone() == ("## 原目标",)
        assert db.execute("SELECT result, report FROM test_runs WHERE id='r1'").fetchone() == ("## 历史结论", "## 历史结论")
        assert db.execute("SELECT request_id, run_id FROM test_attachments WHERE id='a1'").fetchone() == ("t1", "r1")
        assert db.execute("PRAGMA foreign_key_check").fetchall() == []
        db.execute("UPDATE test_requests SET objective = ? WHERE id='t1'", ("## 长目标\n" + "验证" * 1000,))
    migrate("downgrade", "e018")
    migrate("upgrade", "head")
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT count(*) FROM test_runs").fetchone()[0] == 1
        assert db.execute("SELECT count(*) FROM test_attachments").fetchone()[0] == 1
