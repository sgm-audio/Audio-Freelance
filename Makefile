.PHONY: run dev backend frontend install clean check test

run: dev        # default: start both

dev:            # start backend + frontend with unified launcher (all platforms)
	python run.py

backend:        # start backend only
	uv run python main.py

frontend:       # start frontend only
	cd frontend && npm run dev

install:        # install all dependencies
	uv sync
	cd frontend && npm install

build:          # build frontend for production
	cd frontend && npm run build

test:           # run backend tests
	uv run pytest tests/

clean:          # clean build artifacts
	rm -rf frontend/.next frontend/node_modules
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true

check:          # run ruff linter
	ruff check .
