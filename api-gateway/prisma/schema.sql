-- DocMind AI - Complete Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ghcngrvcotrotjnaptgr/sql/new

-- Create ENUMs
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "JobType" AS ENUM ('CONVERSION', 'OCR', 'SUMMARIZATION', 'TRANSLATION', 'ENTITY_EXTRACTION', 'CLASSIFICATION', 'TABLE_EXTRACTION', 'AUDIO_AI', 'VIDEO_AI', 'IMAGE_AI');
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- Users table
CREATE TABLE IF NOT EXISTS "users" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'USER',
  "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
  "googleId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table
CREATE TABLE IF NOT EXISTS "sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3)
);

-- Password resets
CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Verification tokens
CREATE TABLE IF NOT EXISTS "verification_tokens" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Documents
CREATE TABLE IF NOT EXISTS "documents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Job logs
CREATE TABLE IF NOT EXISTS "job_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "documentId" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "jobType" "JobType" NOT NULL,
  "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
  "resultKey" TEXT,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS "chat_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "documentId" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages
CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "sessionId" UUID NOT NULL REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
  "role" "ChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "citations" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- OCR results
CREATE TABLE IF NOT EXISTS "ocr_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "documentId" UUID NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
  "text" TEXT NOT NULL,
  "layout" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Extracted tables
CREATE TABLE IF NOT EXISTS "extracted_tables" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "documentId" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "pageNumber" INTEGER NOT NULL,
  "tableData" JSONB NOT NULL,
  "csvUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Entities
CREATE TABLE IF NOT EXISTS "entities" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "documentId" UUID NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "name" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "startChar" INTEGER NOT NULL,
  "endChar" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Resume analyses
CREATE TABLE IF NOT EXISTS "resume_analyses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "documentId" UUID NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
  "skills" JSONB NOT NULL,
  "education" JSONB NOT NULL,
  "experience" JSONB NOT NULL,
  "projects" JSONB NOT NULL,
  "atsScore" INTEGER NOT NULL,
  "suggestions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Document classifications
CREATE TABLE IF NOT EXISTS "document_classifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "documentId" UUID NOT NULL UNIQUE REFERENCES "documents"("id") ON DELETE CASCADE,
  "label" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE IF NOT EXISTS "notifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "data" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  "userId" UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
  "status" TEXT NOT NULL,
  "stripeCustomerId" TEXT UNIQUE,
  "stripeSubscriptionId" TEXT UNIQUE,
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Prisma migration tracking table
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) NOT NULL PRIMARY KEY,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);
