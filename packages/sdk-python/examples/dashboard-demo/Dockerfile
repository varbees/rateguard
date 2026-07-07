# Build from the repo root: docker build -f packages/sdk-python/examples/dashboard-demo/Dockerfile packages/sdk-python
FROM python:3.12-slim
WORKDIR /src
COPY . .
# uvicorn/httpx are this example's own runtime, not RateGuard's — the
# package itself stays dependency-free unless a caller opts into an extra.
RUN pip install --no-cache-dir . uvicorn httpx
EXPOSE 8082
ENTRYPOINT ["python3", "examples/dashboard-demo/main.py"]
