# CPU image. The web build is static. The server is Python.
FROM node:22-bookworm-slim AS web
WORKDIR /src
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci
COPY web ./web
RUN cd web && npm run build

FROM python:3.12-slim-bookworm
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends libglib2.0-0 libgl1 \
  && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY trainer_studio ./trainer_studio
COPY ee ./ee
COPY plugins ./plugins
COPY --from=web /src/web/out ./static
COPY LICENSE README.md README.tr.md LICENSING.md CHANGELOG.md build.json* ./
ENV STUDIO_HOST=0.0.0.0 \
    STUDIO_PORT=43150 \
    STUDIO_DATA=/var/lib/trainer-studio \
    STUDIO_DATASET=/data \
    PYTHONUNBUFFERED=1
EXPOSE 43150
VOLUME ["/data", "/var/lib/trainer-studio"]
CMD ["python", "-m", "trainer_studio"]
