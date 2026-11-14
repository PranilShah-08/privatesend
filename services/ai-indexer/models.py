"""
Pydantic data models and schemas for the ephemeral AI indexer microservice.
Adheres to zero-persistence, in-memory ephemeral processing contracts.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class EphemeralAudit(BaseModel):
    """Zero-persistence security and audit metadata."""
    zero_disk_persistence: bool = Field(
        default=True,
        description="Confirms no file, vector, or embedding touched disk"
    )
    in_memory_only: bool = Field(
        default=True,
        description="Confirms operations occurred strictly in volatile RAM"
    )
    flushed: bool = Field(
        default=True,
        description="Confirms all in-memory indices and docstores were purged post-request"
    )
    retention_policy: str = Field(
        default="zero-retention-ephemeral-ram",
        description="Guaranteed data retention lifecycle"
    )
    bytes_written_to_disk: int = Field(
        default=0,
        description="Exact count of bytes persisted to disk storage"
    )


class SourceChunk(BaseModel):
    """Information on a source chunk retrieved during semantic querying."""
    chunk_index: int = Field(..., description="Zero-based index of the chunk")
    text_snippet: str = Field(..., description="Snippet of text from the retrieved chunk")
    score: Optional[float] = Field(None, description="Similarity score of the retrieved chunk")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata attached to the chunk")


class IndexEphemeralRequest(BaseModel):
    """Request payload for ephemeral in-memory indexing and Q&A."""
    text: str = Field(
        ...,
        min_length=1,
        max_length=5_000_000,
        description="Raw document, text, or code content to index ephemerally"
    )
    query: Optional[str] = Field(
        default=None,
        description="Optional semantic search or question answering query"
    )
    metadata: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Optional document metadata (e.g., filename, file_type, size)"
    )
    extract_summary: bool = Field(
        default=True,
        description="Whether to generate an ephemeral synopsis of the content"
    )
    extract_insights: bool = Field(
        default=True,
        description="Whether to extract key structural insights and takeaways"
    )
    extract_keywords: bool = Field(
        default=True,
        description="Whether to extract salient keywords and topics"
    )
    similarity_top_k: int = Field(
        default=3,
        ge=1,
        le=20,
        description="Number of top matching chunks to retrieve for querying"
    )

    @field_validator("text")
    @classmethod
    def validate_non_empty_text(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Document text must not be empty or whitespace only")
        return v


class IndexEphemeralResponse(BaseModel):
    """Response payload returned after ephemeral indexing, querying, and memory flushing."""
    status: str = Field(default="success", description="Outcome status")
    query: Optional[str] = Field(default=None, description="The query answered, if provided")
    answer: Optional[str] = Field(default=None, description="Semantic answer synthesized from RAM index")
    summary: Optional[str] = Field(default=None, description="Ephemeral synopsis of content")
    key_insights: List[str] = Field(default_factory=list, description="Extracted key bullet points")
    keywords: List[str] = Field(default_factory=list, description="Extracted keywords and topics")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Enriched metadata")
    sources: List[SourceChunk] = Field(default_factory=list, description="Retrieved source chunks")
    chunks_indexed: int = Field(..., description="Total in-memory chunks created and flushed")
    audit: EphemeralAudit = Field(default_factory=EphemeralAudit, description="Zero-persistence audit")


class HealthResponse(BaseModel):
    """Health check response confirming zero disk persistence."""
    status: str = Field(default="healthy")
    service: str = Field(default="privatesend-ai-indexer")
    version: str = Field(default="1.0.0")
    zero_disk_persistence: bool = Field(
        default=True,
        description="Confirms zero-disk persistence policy is strictly active"
    )
    storage_mode: str = Field(default="volatile_ram")
    ephemeral_guarantee: str = Field(
        default="Zero data retention - Volatile in-memory LlamaIndex only"
    )
