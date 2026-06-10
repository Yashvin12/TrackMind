.PHONY: setup dev dev-backend dev-frontend

setup:
	cd backend && python -m venv venv && .\venv\Scripts\pip install -r requirements.txt
	cd frontend && npm install

dev-backend:
	cd backend && .\venv\Scripts\uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

dev:
	@echo "Starting backend and frontend..."
	start cmd /c "make dev-backend"
	start cmd /c "make dev-frontend"
