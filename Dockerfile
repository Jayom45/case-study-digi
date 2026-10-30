# Stage 1: build the React frontend (skipped gracefully until frontend/ exists)
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/ ./
RUN if [ -f package.json ]; then npm ci && npm run build; else mkdir -p dist; fi

# Stage 2: Python API that also serves the built frontend
FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/ backend/
COPY samples/ samples/
COPY --from=web /web/dist frontend/dist
WORKDIR /app/backend
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
