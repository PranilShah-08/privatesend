# ------------------------------------------------------------------------------
# Build Stage
# ------------------------------------------------------------------------------
FROM rust:1-slim-bookworm AS builder

WORKDIR /usr/src/lossless-core

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends pkg-config && \
    rm -rf /var/lib/apt/lists/*

# Cache dependencies by copying manifest first
COPY Cargo.toml Cargo.lock* ./
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    echo "pub fn dummy() {}" > src/lib.rs && \
    cargo build --release && \
    rm -rf src

# Copy real source code and compile optimized release binary
COPY src ./src
RUN touch src/main.rs src/lib.rs && \
    cargo build --release --locked || cargo build --release

# Strip binary to reduce container image size and surface area
RUN strip target/release/lossless-core

# ------------------------------------------------------------------------------
# Runtime Stage (Minimal, Unprivileged, Read-Only, Zero-Retention)
# ------------------------------------------------------------------------------
FROM debian:bookworm-slim AS runtime

# Install CA certificates for secure verification
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Create unprivileged system user with fixed UID/GID for strict zero-trust runtime
RUN groupadd -g 10001 lossless && \
    useradd -u 10001 -g lossless -M -s /sbin/nologin lossless

# Copy stripped binary from builder
COPY --from=builder /usr/src/lossless-core/target/release/lossless-core /usr/local/bin/lossless-core

# Ensure executable permissions
RUN chmod 0755 /usr/local/bin/lossless-core

# Run as unprivileged user
USER lossless:lossless

# Set zero retention working environment
WORKDIR /tmp

# Binary entrypoint
ENTRYPOINT ["/usr/local/bin/lossless-core"]
CMD ["--help"]
