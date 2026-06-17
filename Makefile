.PHONY: run dev backend frontend clean

run: dev        # default: start both

dev:            # start backend + frontend
	./run.sh

backend:        # start backend only
	uv run python main.py

frontend:       # start frontend only
	cd frontend && npm run dev

install:        # install all dependencies
	uv sync
	cd frontend && npm install

build:          # build frontend for production
	cd frontend && npx next build

test:           # run backend tests
	uv run --with pytest --with pytest-asyncio pytest tests/

changelog:      # show unreleased changes
	git log --oneline `git describe --tags --abbrev=0 2>/dev/null || git rev-list --max-parents=0 HEAD`..HEAD

release:        # tag and push a new version (usage: make release V=v0.2.0)
	git tag $(V) && git push origin $(V)

clean:          # clean build artifacts
	rm -rf frontend/.next frontend/node_modules
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .pytest_cache -exec rm -rf {} + 2>/dev/null || true
