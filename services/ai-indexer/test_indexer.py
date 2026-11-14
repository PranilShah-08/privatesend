"""
Unit and integration tests for the ephemeral AI indexer microservice.
Validates in-memory indexing, semantic Q&A, memory flushing, and zero disk persistence.
"""

import asyncio
import os
import tempfile
import warnings
from unittest.mock import patch
import pytest
from starlette.testclient import TestClient

# Suppress Starlette testclient httpx deprecation warning
warnings.filterwarnings("ignore", category=DeprecationWarning)

from main import app
from indexer import EphemeralLlamaIndexer, ContentAnalyzer, EphemeralLocalEmbedding, EphemeralLocalLLM
from models import IndexEphemeralRequest


@pytest.fixture
def client() -> TestClient:
    """Fixture providing a TestClient connected to the FastAPI application."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def indexer_instance() -> EphemeralLlamaIndexer:
    """Fixture providing a fresh ephemeral indexer instance."""
    return EphemeralLlamaIndexer()


def test_health_endpoint_confirms_zero_disk_persistence(client: TestClient) -> None:
    """
    Arrange: TestClient for the microservice.
    Act: GET /health.
    Assert: HTTP 200 with zero_disk_persistence: True and volatile_ram storage.
    """
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["zero_disk_persistence"] is True
    assert data["storage_mode"] == "volatile_ram"
    assert "volatile" in data["ephemeral_guarantee"].lower()


def test_root_endpoint_metadata(client: TestClient) -> None:
    """
    Arrange: TestClient for the microservice.
    Act: GET /.
    Assert: HTTP 200 and root metadata contains zero_disk_persistence.
    """
    response = client.get("/")

    assert response.status_code == 200
    data = response.json()
    assert data["zero_disk_persistence"] is True
    assert data["service"] == "privatesend-ai-indexer"
    assert data["retention_policy"] == "zero-retention-ephemeral-ram"


def test_index_ephemeral_document_success(client: TestClient) -> None:
    """
    Arrange: Prepare text document and request payload.
    Act: POST /index-ephemeral.
    Assert: Validates summary, insights, keywords, chunks indexed, and zero persistence audit.
    """
    payload = {
        "text": (
            "LosslessDrop is a privacy-first P2P file transfer platform. "
            "It establishes direct WebRTC connections between browsers. "
            "Signaling occurs over ephemeral WebSocket rooms with 10 minute TTL. "
            "No files or user data are ever stored on servers or written to disk."
        ),
        "metadata": {"filename": "overview.txt"},
        "extract_summary": True,
        "extract_insights": True,
        "extract_keywords": True,
    }

    response = client.post("/index-ephemeral", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["chunks_indexed"] >= 1
    assert data["summary"] is not None
    assert len(data["summary"]) > 0
    assert len(data["keywords"]) > 0
    assert data["metadata"]["storage_medium"] == "volatile_ram"
    assert data["metadata"]["filename"] == "overview.txt"

    # Audit validation
    audit = data["audit"]
    assert audit["zero_disk_persistence"] is True
    assert audit["in_memory_only"] is True
    assert audit["flushed"] is True
    assert audit["bytes_written_to_disk"] == 0
    assert audit["retention_policy"] == "zero-retention-ephemeral-ram"


def test_index_ephemeral_semantic_query(client: TestClient) -> None:
    """
    Arrange: Text content with multiple facts and a specific question.
    Act: POST /index-ephemeral with query.
    Assert: Returns synthesized answer citing the ephemeral context and returns source chunk.
    """
    payload = {
        "text": (
            "Architecture Details:\n"
            "1. Encryption uses AES-GCM with 256-bit ephemeral keys generated via WebCrypto.\n"
            "2. Signaling runs through Node.js WebSocket relays.\n"
            "3. Storage policy enforces strict volatile RAM indexing with zero retention."
        ),
        "query": "How is encryption handled?",
        "similarity_top_k": 2,
    }

    response = client.post("/index-ephemeral", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["query"] == "How is encryption handled?"
    assert data["answer"] is not None
    assert "encryption" in data["answer"].lower() or "aes-gcm" in data["answer"].lower()
    assert len(data["sources"]) > 0
    assert data["sources"][0]["text_snippet"] != ""


def test_index_ephemeral_code_analysis(client: TestClient) -> None:
    """
    Arrange: Python code snippet with class and function definitions.
    Act: POST /index-ephemeral.
    Assert: Enriched metadata detects Python, insights extract defined classes/functions.
    """
    code_content = (
        "import hashlib\n\n"
        "class EphemeralVault:\n"
        "    def __init__(self, key: str):\n"
        "        self.key = key\n\n"
        "    def encrypt_payload(self, data: bytes) -> bytes:\n"
        "        return hashlib.sha256(data).digest()\n"
    )
    payload = {
        "text": code_content,
        "metadata": {"filename": "vault.py"},
        "extract_insights": True,
    }

    response = client.post("/index-ephemeral", json=payload)

    assert response.status_code == 200
    data = response.json()
    assert data["metadata"]["content_type"] == "python"
    insights_str = " ".join(data["key_insights"])
    assert "EphemeralVault" in insights_str
    assert "encrypt_payload" in insights_str


def test_zero_disk_persistence_verification(client: TestClient) -> None:
    """
    Arrange: Snapshot directory file state and temp directory before request.
    Act: Execute ephemeral indexing of large text.
    Assert: Verify that zero new files or persisted artifacts were written to disk.
    """
    service_dir = os.path.dirname(os.path.abspath(__file__))
    before_files = set(os.listdir(service_dir))
    temp_dir = tempfile.gettempdir()
    before_temp_count = len(os.listdir(temp_dir))

    payload = {
        "text": "Sensitive confidential ephemeral transmission " * 200,
        "query": "What is this transmission?",
        "extract_summary": True,
    }

    response = client.post("/index-ephemeral", json=payload)

    assert response.status_code == 200
    after_files = set(os.listdir(service_dir))
    after_temp_count = len(os.listdir(temp_dir))

    # Assert no new files created in service directory
    diff = after_files - before_files
    file_diff = {f for f in diff if not f.startswith("__pycache__") and not f.startswith(".pytest")}
    assert len(file_diff) == 0, f"Unexpected files written to disk: {file_diff}"

    # Verify audit guarantee
    audit = response.json()["audit"]
    assert audit["zero_disk_persistence"] is True
    assert audit["bytes_written_to_disk"] == 0


def test_validation_error_on_empty_text(client: TestClient) -> None:
    """
    Arrange: Empty and whitespace-only text payloads.
    Act: POST /index-ephemeral.
    Assert: HTTP 422 Unprocessable Entity.
    """
    res1 = client.post("/index-ephemeral", json={"text": ""})
    res2 = client.post("/index-ephemeral", json={"text": "   \n\t  "})

    assert res1.status_code == 422
    assert res2.status_code == 422


def test_validation_error_on_invalid_similarity_k(client: TestClient) -> None:
    """
    Arrange: Request with similarity_top_k outside allowed [1, 20] range.
    Act: POST /index-ephemeral.
    Assert: HTTP 422 Unprocessable Entity.
    """
    res_low = client.post("/index-ephemeral", json={"text": "Valid text", "similarity_top_k": 0})
    res_high = client.post("/index-ephemeral", json={"text": "Valid text", "similarity_top_k": 50})

    assert res_low.status_code == 422
    assert res_high.status_code == 422


def test_internal_server_error_handling(client: TestClient) -> None:
    """
    Arrange: Mock an unhandled exception inside process.
    Act: POST /index-ephemeral.
    Assert: HTTP 500 with clean error response.
    """
    with patch("main.indexer_engine.process", side_effect=RuntimeError("Simulated memory error")):
        response = client.post("/index-ephemeral", json={"text": "Valid text for processing"})

    assert response.status_code == 500
    assert "Ephemeral indexing failed" in response.json()["detail"]


def test_value_error_handling(client: TestClient) -> None:
    """
    Arrange: Mock a ValueError inside process.
    Act: POST /index-ephemeral.
    Assert: HTTP 422 with clean error response.
    """
    with patch("main.indexer_engine.process", side_effect=ValueError("Corrupt character sequence")):
        response = client.post("/index-ephemeral", json={"text": "Valid text for processing"})

    assert response.status_code == 422
    assert "Corrupt character sequence" in response.json()["detail"]


def test_content_analyzer_heuristics() -> None:
    """
    Arrange: Samples of typescript, json, markdown, html, and plain text.
    Act: Analyze content types and summaries.
    Assert: Correct types and summaries detected.
    """
    ts_code = "export interface SessionConfig { id: string; active: boolean; }"
    json_data = '{"room": "abc", "peers": 2}'
    md_text = "# Title\n- Feature 1\n- Feature 2"
    html_doc = "<!DOCTYPE html><html><body><h1>Header</h1></body></html>"
    js_funcs = "const sendPayload = (data) => { return true; };\nconst receivePayload = () => {};"

    assert ContentAnalyzer.detect_content_type(ts_code, "session.ts") == "typescript"
    assert ContentAnalyzer.detect_content_type(json_data, None) == "json"
    assert ContentAnalyzer.detect_content_type(md_text, "notes.md") == "markdown"
    assert ContentAnalyzer.detect_content_type(html_doc, None) == "html"
    assert ContentAnalyzer.detect_content_type(js_funcs, None) == "typescript/javascript"

    insights = ContentAnalyzer.extract_insights(js_funcs, "javascript")
    assert any("sendPayload" in ins for ins in insights)

    empty_summary = ContentAnalyzer.generate_summary("")
    assert empty_summary == "Empty document."

    summary = ContentAnalyzer.generate_summary("Sentence one. Sentence two! Sentence three.")
    assert "Sentence one." in summary
    assert "Sentence two!" in summary


def test_indexer_memory_flush_lifecycle(indexer_instance: EphemeralLlamaIndexer) -> None:
    """
    Arrange: Indexer instance and request.
    Act: Process request.
    Assert: Returned response is complete and all internal memory structures were flushed.
    """
    req = IndexEphemeralRequest(
        text="Temporary in-memory data that must not persist anywhere.",
        query="What is this data?",
        extract_summary=True,
    )
    resp = indexer_instance.process(req)

    assert resp.status == "success"
    assert resp.audit.flushed is True
    assert resp.audit.zero_disk_persistence is True


def test_embedding_and_llm_async_and_stream() -> None:
    """
    Arrange: EphemeralLocalEmbedding and EphemeralLocalLLM instances.
    Act: Call async embedding methods and stream_complete generator.
    Assert: Returns expected dimensions and yields completion.
    """
    embed = EphemeralLocalEmbedding()
    q_emb = asyncio.run(embed._aget_query_embedding("async query"))
    t_emb = asyncio.run(embed._aget_text_embedding("async text"))
    assert len(q_emb) == 128
    assert len(t_emb) == 128

    llm = EphemeralLocalLLM()
    gen = llm.stream_complete("Prompt text")
    res = next(gen)
    assert res.text != ""
