# DocMind AI - Document Intelligence Platform

DocMind AI is a production-grade SaaS application designed to understand, convert, search, analyze, and interact with various document formats (PDFs, Office files, media, and images).

## System Architecture

```
                      +-------------------+
                      |   Client Browser  |
                      +---------+---------+
                                | (HTTP/WS)
                                v
                      +---------+---------+
                      |    Nginx Proxy    |
                      +---------+---------+
                                |
             +------------------+------------------+
             |                                     |
             v                                     v
+------------+------------+           +------------+------------+
|        Frontend         |           |       API Gateway       |
|  (React/TypeScript/Vite) |           | (Express/TypeScript/JWT)|
+-------------------------+           +------------+------------+
                                                   |
                                 +-----------------+-----------------+
                                 |                                   |
                                 v                                   v
                         +-------+-------+                   +-------+-------+
                         |    PostgreSQL |                   |    Redis &    |
                         |  (Prisma ORM) |                   |    BullMQ     |
                         +---------------+                   +-------+-------+
                                                                     |
                                                                     v
                                                             +-------+-------+
                                                             |   AI Service  |
                                                             | (FastAPI/Py)  |
                                                             +---+-------+---+
                                                                 |       |
                                                +----------------+       +----------------+
                                                |                                         |
                                                v                                         v
                                        +-------+-------+                         +-------+-------+
                                        |    Qdrant     |                         |    AWS S3     |
                                        | (Vector DB)   |                         |  (Storage)    |
                                        +---------------+                         +---------------+
```

## Services Overview

1. **Frontend**: React SPA powered by TypeScript, TailwindCSS, TanStack Query, Framer Motion, and Socket.io client.
2. **API Gateway**: REST API layer using Node.js, Express, TypeScript, and Prisma. It handles user authentication, file metadata tracking, notifications, and queues computationally intensive jobs.
3. **AI Service**: FastAPI service executing machine learning models (EasyOCR, HuggingFace transformers, spaCy, and OpenCV) for OCR, classification, table extraction, and generating document embeddings.
4. **BullMQ Worker (Optional/Embedded)**: Asynchronous background worker using Redis as a message broker to queue conversions, OCR runs, and heavy processing.

## Getting Started

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- Docker and Docker Compose

### Running Backing Services Locally
Start the infrastructure backing services using Docker Compose:
```bash
docker compose up -d
```

This starts:
- PostgreSQL on port `5432`
- Redis on port `6379`
- Qdrant Vector DB on port `6333`
- LocalStack (S3) on port `4566`
