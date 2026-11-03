"""Regression checks keeping Chroma embedded rather than network-exposed."""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_application_uses_embedded_chroma_client_only():
    python_sources = "\n".join(
        path.read_text(encoding="utf-8")
        for path in ROOT.rglob("*.py")
        if ".venv" not in path.parts and path != Path(__file__)
    )
    assert "chromadb.PersistentClient" in python_sources
    assert "chromadb.HttpClient" not in python_sources


def test_compose_files_do_not_publish_a_chroma_service():
    for path in ROOT.glob("*compose*.y*ml"):
        content = path.read_text(encoding="utf-8").lower()
        assert "chromadb/chroma" not in content, path
        assert "chroma_server_http_port" not in content, path
