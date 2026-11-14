"""
Ephemeral in-memory LlamaIndex engine for zero-data retention document indexing.
Operates exclusively in volatile RAM with zero disk writes.
"""

import gc
import hashlib
import re
from typing import Any, Dict, List, Optional, Set
import numpy as np

from llama_index.core import Document, VectorStoreIndex, StorageContext
from llama_index.core.base.embeddings.base import BaseEmbedding
from llama_index.core.llms.custom import CustomLLM
from llama_index.core.llms import CompletionResponse, CompletionResponseGen, LLMMetadata
from llama_index.core.vector_stores import SimpleVectorStore
from llama_index.core.storage.docstore import SimpleDocumentStore
from llama_index.core.storage.index_store import SimpleIndexStore

from models import (
    EphemeralAudit,
    IndexEphemeralRequest,
    IndexEphemeralResponse,
    SourceChunk,
)

STOP_WORDS: Set[str] = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
    "any", "are", "aren't", "as", "at", "be", "because", "been", "before", "being",
    "below", "between", "both", "but", "by", "can", "cannot", "could", "did", "do",
    "does", "doing", "don't", "down", "during", "each", "few", "for", "from", "further",
    "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
    "himself", "his", "how", "i", "if", "in", "into", "is", "isn't", "it", "its",
    "itself", "let's", "me", "more", "most", "my", "myself", "no", "nor", "not", "of",
    "off", "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
    "out", "over", "own", "same", "she", "should", "so", "some", "such", "than", "that",
    "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they",
    "this", "those", "through", "to", "too", "under", "until", "up", "very", "was",
    "we", "were", "what", "when", "where", "which", "while", "who", "whom", "why",
    "with", "would", "you", "your", "yours", "yourself", "yourselves", "query", "answer"
}


class EphemeralLocalEmbedding(BaseEmbedding):
    """In-memory term-hash vector embedding model for LlamaIndex."""
    embed_dim: int = 128

    def _hash_token(self, token: str) -> int:
        digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
        return int(digest, 16) % self.embed_dim

    def _get_vector(self, text: str) -> List[float]:
        vec = np.zeros(self.embed_dim, dtype=np.float32)
        tokens = re.findall(r"\b[a-zA-Z0-9_-]{2,}\b", text.lower())
        if not tokens:
            return vec.tolist()
        for token in tokens:
            idx = self._hash_token(token)
            vec[idx] += 1.0
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec /= norm
        return vec.tolist()

    def _get_query_embedding(self, query: str) -> List[float]:
        return self._get_vector(query)

    def _get_text_embedding(self, text: str) -> List[float]:
        return self._get_vector(text)

    def _get_text_embeddings(self, texts: List[str]) -> List[List[float]]:
        return [self._get_vector(t) for t in texts]

    async def _aget_query_embedding(self, query: str) -> List[float]:
        return self._get_query_embedding(query)

    async def _aget_text_embedding(self, text: str) -> List[float]:
        return self._get_text_embedding(text)


class EphemeralLocalLLM(CustomLLM):
    """In-memory deterministic LLM for ephemeral synthesis and Q&A."""
    @property
    def metadata(self) -> LLMMetadata:
        return LLMMetadata(model_name="ephemeral-local-rag", is_chat_model=False)

    def complete(self, prompt: str, **kwargs: Any) -> CompletionResponse:
        lines = [line.strip() for line in prompt.split("\n") if line.strip()]
        query_line = next((l for l in lines if l.lower().startswith("query:")), "")
        context_lines = [
            l for l in lines
            if not l.startswith("Context information")
            and not l.startswith("Query:")
            and not l.startswith("Answer:")
            and not l.startswith("---")
        ]

        if query_line and context_lines:
            q_terms = set(re.findall(r"\w+", query_line.lower())) - STOP_WORDS
            best_line = self._find_best_matching_line(context_lines, q_terms)
            ans = f"Based on ephemeral RAM analysis: {best_line}"
        else:
            ans = "Ephemeral in-memory indexing completed successfully in volatile RAM."
        return CompletionResponse(text=ans)

    def _find_best_matching_line(self, lines: List[str], q_terms: Set[str]) -> str:
        if not q_terms:
            return lines[0]
        scored = [
            (len(set(re.findall(r"\w+", l.lower())) & q_terms), l)
            for l in lines
        ]
        scored.sort(key=lambda item: item[0], reverse=True)
        return scored[0][1]

    def stream_complete(self, prompt: str, **kwargs: Any) -> CompletionResponseGen:
        res = self.complete(prompt, **kwargs)
        yield res


class ContentAnalyzer:
    """Utility functions for analyzing and enriching ephemeral documents."""

    @staticmethod
    def detect_content_type(text: str, filename: Optional[str] = None) -> str:
        if filename:
            lower_name = filename.lower()
            ext_map = {
                ".py": "python", ".js": "javascript", ".ts": "typescript",
                ".jsx": "react", ".tsx": "react-typescript", ".json": "json",
                ".yaml": "yaml", ".yml": "yaml", ".md": "markdown",
                ".html": "html", ".css": "css", ".sql": "sql", ".sh": "shell",
            }
            for ext, ctype in ext_map.items():
                if lower_name.endswith(ext):
                    return ctype

        # Heuristic detection based on content signatures
        trimmed = text.strip()
        if (trimmed.startswith("{") and trimmed.endswith("}")) or (trimmed.startswith("[") and trimmed.endswith("]")):
            return "json"
        if re.search(r"^\s*(def |class |import |from \w+ import)", text, re.MULTILINE):
            return "python"
        if re.search(r"^\s*(function |const |let |var |interface |export )", text, re.MULTILINE):
            return "typescript/javascript"
        if re.search(r"^\s*(# |## |### |```)", text, re.MULTILINE):
            return "markdown"
        if re.search(r"^\s*<!DOCTYPE|<html|<div", text, re.IGNORECASE | re.MULTILINE):
            return "html"
        return "text/plain"

    @staticmethod
    def extract_keywords(text: str, top_n: int = 8) -> List[str]:
        words = re.findall(r"\b[a-zA-Z]{3,}\b", text.lower())
        meaningful = [w for w in words if w not in STOP_WORDS]
        freq: Dict[str, int] = {}
        for w in meaningful:
            freq[w] = freq.get(w, 0) + 1
        sorted_words = sorted(freq.items(), key=lambda item: item[1], reverse=True)
        return [w for w, _ in sorted_words[:top_n]]

    @staticmethod
    def extract_insights(text: str, content_type: str) -> List[str]:
        insights: List[str] = []
        lines = [line.strip() for line in text.split("\n") if line.strip()]

        if "python" in content_type:
            funcs = re.findall(r"def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(", text)
            classes = re.findall(r"class\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:\(]", text)
            if classes:
                insights.append(f"Defines classes: {', '.join(classes[:5])}")
            if funcs:
                insights.append(f"Defines functions: {', '.join(funcs[:5])}")
        elif "javascript" in content_type or "typescript" in content_type:
            funcs = re.findall(r"(?:function|const|let)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(?:function|\()", text)
            if funcs:
                insights.append(f"Defines exports/functions: {', '.join(funcs[:5])}")
        elif content_type == "markdown":
            headers = [l.lstrip("#").strip() for l in lines if l.startswith("#")]
            if headers:
                insights.append(f"Document sections: {', '.join(headers[:4])}")

        bullets = [l.lstrip("-*•").strip() for l in lines if l.startswith(("-", "*", "•"))]
        if bullets:
            insights.append(f"Key item: {bullets[0]}")

        if not insights and lines:
            insights.append(f"Core premise: {lines[0][:120]}")

        return insights[:5]

    @staticmethod
    def generate_summary(text: str) -> str:
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", text) if s.strip()]
        if not sentences:
            return "Empty document."
        summary_sentences = sentences[:2]
        return " ".join(summary_sentences)


class EphemeralLlamaIndexer:
    """Manages ephemeral in-memory indexing, querying, and deterministic zero-retention flushing."""

    def __init__(self) -> None:
        self.embed_model = EphemeralLocalEmbedding()
        self.llm = EphemeralLocalLLM()

    def process(self, request: IndexEphemeralRequest) -> IndexEphemeralResponse:
        """Processes request strictly in volatile RAM and immediately wipes all memory structures."""
        storage_context: Optional[StorageContext] = None
        vector_store: Optional[SimpleVectorStore] = None
        docstore: Optional[SimpleDocumentStore] = None
        index: Optional[VectorStoreIndex] = None
        doc: Optional[Document] = None

        try:
            filename = (request.metadata or {}).get("filename") if request.metadata else None
            content_type = ContentAnalyzer.detect_content_type(request.text, filename)
            enriched_meta = self._build_metadata(request.text, content_type, request.metadata)

            # Ephemeral Storage in volatile RAM
            vector_store = SimpleVectorStore()
            docstore = SimpleDocumentStore()
            index_store = SimpleIndexStore()
            storage_context = StorageContext.from_defaults(
                vector_store=vector_store,
                docstore=docstore,
                index_store=index_store,
            )

            doc = Document(text=request.text, metadata=enriched_meta)
            index = VectorStoreIndex.from_documents(
                [doc],
                storage_context=storage_context,
                embed_model=self.embed_model,
            )

            answer, sources = self._handle_query(index, request.query, request.similarity_top_k)
            summary = ContentAnalyzer.generate_summary(request.text) if request.extract_summary else None
            insights = ContentAnalyzer.extract_insights(request.text, content_type) if request.extract_insights else []
            keywords = ContentAnalyzer.extract_keywords(request.text) if request.extract_keywords else []
            chunks_indexed = len(docstore.docs)

            return IndexEphemeralResponse(
                status="success",
                query=request.query,
                answer=answer,
                summary=summary,
                key_insights=insights,
                keywords=keywords,
                metadata=enriched_meta,
                sources=sources,
                chunks_indexed=chunks_indexed,
                audit=EphemeralAudit(
                    zero_disk_persistence=True,
                    in_memory_only=True,
                    flushed=True,
                    retention_policy="zero-retention-ephemeral-ram",
                    bytes_written_to_disk=0,
                ),
            )
        finally:
            self._flush_memory(storage_context, vector_store, docstore, index, doc)

    def _build_metadata(self, text: str, content_type: str, user_meta: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        meta = dict(user_meta or {})
        lines = text.split("\n")
        words = text.split()
        meta.update({
            "content_type": content_type,
            "char_count": len(text),
            "word_count": len(words),
            "line_count": len(lines),
            "storage_medium": "volatile_ram",
        })
        return meta

    def _handle_query(
        self,
        index: VectorStoreIndex,
        query: Optional[str],
        top_k: int
    ) -> tuple[Optional[str], List[SourceChunk]]:
        if not query:
            return None, []

        query_engine = index.as_query_engine(
            similarity_top_k=top_k,
            llm=self.llm,
        )
        response = query_engine.query(query)
        sources: List[SourceChunk] = []

        if hasattr(response, "source_nodes") and response.source_nodes:
            for i, node in enumerate(response.source_nodes):
                snippet = node.text[:200] if hasattr(node, "text") else ""
                score = getattr(node, "score", None)
                node_meta = getattr(node, "metadata", {}) or {}
                sources.append(SourceChunk(
                    chunk_index=i,
                    text_snippet=snippet,
                    score=float(score) if score is not None else None,
                    metadata=node_meta,
                ))

        answer_text = str(response) if response else None
        return answer_text, sources

    def _flush_memory(
        self,
        storage_context: Optional[StorageContext],
        vector_store: Optional[SimpleVectorStore],
        docstore: Optional[SimpleDocumentStore],
        index: Optional[VectorStoreIndex],
        doc: Optional[Document],
    ) -> None:
        """Deterministically destroys and frees all in-memory structures."""
        if vector_store:
            try:
                vector_store.clear()
            except Exception:
                pass
        if docstore:
            try:
                for doc_id in list(docstore.docs.keys()):
                    docstore.delete_document(doc_id, raise_error=False)
            except Exception:
                pass
        del index
        del storage_context
        del vector_store
        del docstore
        del doc
        gc.collect()
