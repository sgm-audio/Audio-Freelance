FROM python:3.12-slim

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Install uv
# uv 0.12.23; manifest digest recorded by dependency monitoring on 2026-10-05.
COPY --from=ghcr.io/astral-sh/uv:0.12.23@sha256:61d393e44e249f2e4b526b6c7ddcecce245946826e608e11c93ad4f5bba55b21 /uv /uvx /bin/

# Install dependencies (layer is cached until pyproject.toml changes)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

# Copy source and set ownership
COPY . .
RUN chown -R appuser:appuser /app

# Drop privileges
USER appuser

# Listen on the container interface by default (local run.py still defaults to loopback).
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/api/v1/health')"

CMD ["uv", "run", "python", "main.py"]
