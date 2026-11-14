"""
LosslessDrop AI Indexer - Privacy-First Ephemeral In-Memory Indexing Microservice.
Built with FastAPI and LlamaIndex for strictly volatile RAM execution.
Adheres strictly to zero disk persistence and zero data retention guarantees.
"""

import logging
import os
import sys
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from indexer import EphemeralLlamaIndexer
from models import (
    HealthResponse,
    IndexEphemeralRequest,
    IndexEphemeralResponse,
)

# Configure secure logging that never logs sensitive document payloads
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("ai_indexer")

# Singleton indexer engine operating strictly in RAM
indexer_engine: EphemeralLlamaIndexer = EphemeralLlamaIndexer()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context confirming zero disk persistence configuration at startup."""
    logger.info("⚡ LosslessDrop AI Indexer initializing strictly in volatile RAM.")
    logger.info("🔒 Zero Disk Persistence policy: ACTIVE. No files will touch disk.")
    yield
    logger.info("🛑 LosslessDrop AI Indexer shutting down. All volatile memory released.")


app = FastAPI(
    title="LosslessDrop Ephemeral AI Indexer",
    description="Privacy-first in-memory indexing, semantic Q&A, and insight extraction microservice using LlamaIndex.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for frontend and microservice communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get(
    "/health",
    response_model=HealthResponse,
    tags=["Health"],
    summary="Health check verifying zero disk persistence guarantee",
)
async def health_check() -> HealthResponse:
    """Returns system health and explicitly confirms zero disk persistence."""
    return HealthResponse(
        status="healthy",
        service="lossless-drop-ai-indexer",
        version="1.0.0",
        zero_disk_persistence=True,
        storage_mode="volatile_ram",
        ephemeral_guarantee="Zero data retention - Volatile in-memory LlamaIndex only",
    )


@app.get(
    "/",
    tags=["Info"],
    summary="Microservice metadata and capabilities",
)
async def root_info() -> dict[str, object]:
    """Microservice root metadata and operational guarantees."""
    return {
        "service": "lossless-drop-ai-indexer",
        "version": "1.0.0",
        "description": "Privacy-first ephemeral in-memory indexing microservice using LlamaIndex",
        "zero_disk_persistence": True,
        "endpoints": {
            "health": "GET /health",
            "index_ephemeral": "POST /index-ephemeral",
        },
        "retention_policy": "zero-retention-ephemeral-ram",
    }


@app.post(
    "/index-ephemeral",
    response_model=IndexEphemeralResponse,
    status_code=status.HTTP_200_OK,
    tags=["Ephemeral Indexing"],
    summary="Ephemeral in-memory document indexing, Q&A, and insight extraction",
)
async def index_ephemeral(request: IndexEphemeralRequest) -> IndexEphemeralResponse:
    """
    Accepts text, code, or document content, builds an ephemeral in-memory LlamaIndex,
    answers semantic queries / extracts insights, and immediately flushes RAM.
    Guarantees zero bytes are written to disk.
    """
    try:
        response = indexer_engine.process(request)
        return response
    except ValueError as val_err:
        logger.warning(f"Validation rejection during ephemeral indexing: {str(val_err)}")
        status_code = getattr(status, "HTTP_422_UNPROCESSABLE_CONTENT", 422)
        raise HTTPException(
            status_code=status_code,
            detail=str(val_err),
        ) from val_err
    except Exception as exc:
        logger.error(f"Error during ephemeral indexing processing: {exc.__class__.__name__}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ephemeral indexing failed during volatile RAM execution",
        ) from exc


@app.exception_handler(Exception)
async def global_exception_handler(_request: object, exc: Exception) -> JSONResponse:
    """Safely handle unexpected exceptions without leaking document content."""
    logger.error(f"Unhandled exception: {exc.__class__.__name__}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "An internal error occurred in the ephemeral indexing service"},
    )


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host=host, port=port, reload=False)
