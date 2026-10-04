FROM python:3.12-slim

# Create non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

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
