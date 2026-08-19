"""Tests for the internal API boundary (D-021).

Run in-process with ``TestClient`` against the real ASGI app, so routing,
dependency resolution and the auth dependency are all exercised for real. No port
binding, no server process, no committed fixtures — the pattern proven during the
audit (D-002). The previous suite pointed at a hardcoded
``http://127.0.0.1:8000`` with no way to start it, which is one reason none of it
ran.

The token tests matter most. This service holds the service-role Supabase key, so
an unauthenticated caller who could enqueue jobs would be able to drive
processing against any user's folder.
"""

import pytest
from fastapi.testclient import TestClient

from backend import auth, main
from backend.db import jobs as jobs_db

TOKEN = "test-service-token-do-not-use-in-production"


@pytest.fixture
def client(monkeypatch):
    """A TestClient with a known service token and no real database.

    The token is patched on :mod:`backend.auth` rather than in the environment
    because ``config`` reads env vars at import time, so setting one later would
    have no effect.
    """
    monkeypatch.setattr(auth, "PROCESSING_SERVICE_TOKEN", TOKEN)
    return TestClient(main.app)


@pytest.fixture
def fake_queue(monkeypatch):
    """Capture enqueue calls instead of hitting Supabase.

    Returns the list of recorded calls so a test can assert what would have been
    queued.
    """
    calls: list[dict] = []

    def fake_enqueue(folder_id, user_id, job_type, idempotency_key, payload=None):
        calls.append(
            {
                "folder_id": folder_id,
                "user_id": user_id,
                "job_type": job_type,
                "idempotency_key": idempotency_key,
            }
        )
        return f"job-{len(calls)}"

    monkeypatch.setattr(jobs_db, "enqueue_job", fake_enqueue)
    monkeypatch.setattr(
        jobs_db, "extract_idempotency_key", lambda f, u: f"extract:{f}:fixed"
    )
    monkeypatch.setattr(
        jobs_db, "analyze_idempotency_key", lambda f, u: f"analyze:{f}:fixed"
    )
    return calls


FOLDER = "11111111-1111-1111-1111-111111111111"
USER = "22222222-2222-2222-2222-222222222222"
BODY = {"folder_id": FOLDER, "user_id": USER}


class TestHealth:
    def test_health_needs_no_token(self, client):
        """Platform health checks cannot hold a secret."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json()["status"] == "ok"

    def test_health_reports_algorithm_versions(self, client):
        """So a worker/database version mismatch is visible without shelling in."""
        payload = client.get("/health").json()
        assert "normalizer_version" in payload
        assert "algo_version" in payload


class TestServiceTokenEnforcement:
    """Every /internal route requires the shared token."""

    ROUTES = ["/internal/jobs/extract", "/internal/jobs/analyze"]

    def test_missing_header_is_rejected(self, client):
        for route in self.ROUTES:
            response = client.post(route, json=BODY)
            assert response.status_code == 401, route

    def test_wrong_token_is_rejected(self, client):
        for route in self.ROUTES:
            response = client.post(
                route, json=BODY, headers={"Authorization": "Bearer wrong-token"}
            )
            assert response.status_code == 401, route

    def test_malformed_header_is_rejected(self, client):
        for header in (TOKEN, f"Basic {TOKEN}", "Bearer", "Bearer "):
            response = client.post(
                "/internal/jobs/extract", json=BODY, headers={"Authorization": header}
            )
            assert response.status_code == 401, header

    def test_correct_token_is_accepted(self, client, fake_queue):
        response = client.post(
            "/internal/jobs/extract",
            json=BODY,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 200

    def test_unconfigured_token_fails_closed(self, monkeypatch):
        """A service with no token must reject everyone, not accept everyone."""
        monkeypatch.setattr(auth, "PROCESSING_SERVICE_TOKEN", "")
        response = TestClient(main.app).post(
            "/internal/jobs/extract", json=BODY, headers={"Authorization": "Bearer x"}
        )
        assert response.status_code == 500
        assert "not configured" in response.json()["detail"]


class TestEnqueue:
    def test_extract_enqueues_one_job(self, client, fake_queue):
        response = client.post(
            "/internal/jobs/extract",
            json=BODY,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "queued"
        assert response.json()["duplicate"] is False
        assert len(fake_queue) == 1
        assert fake_queue[0]["job_type"] == "extract"

    def test_analyze_enqueues_one_job(self, client, fake_queue):
        response = client.post(
            "/internal/jobs/analyze",
            json=BODY,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 200
        assert fake_queue[0]["job_type"] == "analyze"

    def test_duplicate_enqueue_reports_success_not_an_error(
        self, client, monkeypatch
    ):
        """A double-clicked button is a no-op, not a failure the user sees (D-018)."""
        monkeypatch.setattr(jobs_db, "enqueue_job", lambda **kwargs: None)
        monkeypatch.setattr(
            jobs_db, "extract_idempotency_key", lambda f, u: "extract:fixed"
        )

        response = client.post(
            "/internal/jobs/extract",
            json=BODY,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )

        assert response.status_code == 200
        assert response.json()["duplicate"] is True
        assert response.json()["job_id"] is None

    def test_database_failure_is_a_retryable_503(self, client, monkeypatch):
        """503 rather than 500: the request was valid and retrying is correct."""
        def explode(**kwargs):
            raise RuntimeError("connection refused")

        monkeypatch.setattr(jobs_db, "enqueue_job", explode)
        monkeypatch.setattr(
            jobs_db, "extract_idempotency_key", lambda f, u: "extract:fixed"
        )

        response = client.post(
            "/internal/jobs/extract",
            json=BODY,
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 503

    def test_missing_fields_are_rejected(self, client, fake_queue):
        response = client.post(
            "/internal/jobs/extract",
            json={"folder_id": FOLDER},
            headers={"Authorization": f"Bearer {TOKEN}"},
        )
        assert response.status_code == 422
        assert fake_queue == []


class TestRouteSurface:
    """The service exposes only what A.7 specifies."""

    def test_only_three_routes_exist(self, client):
        paths = {
            route.path
            for route in main.app.routes
            if getattr(route, "path", "").startswith(("/internal", "/health"))
        }
        assert paths == {
            "/health",
            "/internal/jobs/extract",
            "/internal/jobs/analyze",
        }

    def test_the_retired_session_routes_are_gone(self, client):
        """All eight /api/sessions/* routes were replaced (D-010, D-021)."""
        for path in (
            "/api/sessions",
            "/api/upload",
            "/api/sessions/abc",
            "/api/sessions/abc/analytics",
            "/api/sessions/abc/questions",
            "/api/sessions/abc/rejected",
            "/api/sessions/abc/export/csv",
        ):
            assert client.get(path).status_code == 404, path
            assert client.post(path, json={}).status_code == 404, path

    def test_no_cors_headers_are_sent(self):
        """The browser never calls this service, so CORS was removed (D-021).

        The old app set allow_origins=["*"] with allow_credentials=True — a
        combination browsers reject and which is unsafe once auth exists.
        """
        response = TestClient(main.app).options(
            "/health", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}
        )
        assert "access-control-allow-origin" not in {
            key.lower() for key in response.headers
        }
