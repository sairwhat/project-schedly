-- CreateEnum
CREATE TYPE "AcademicTaskSource" AS ENUM ('manual', 'google_classroom');

-- CreateEnum
CREATE TYPE "AcademicTaskSyncStatus" AS ENUM ('synced', 'orphaned');

-- CreateEnum
CREATE TYPE "GoogleConnectionStatus" AS ENUM ('connected', 'revoked', 'disconnected');

-- CreateTable
CREATE TABLE "academic_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "source" "AcademicTaskSource" NOT NULL DEFAULT 'manual',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "due_date" TIMESTAMP(3),
    "course_name" TEXT,
    "course_section" TEXT,
    "external_course_id" TEXT,
    "external_coursework_id" TEXT,
    "external_state" TEXT,
    "external_link" TEXT,
    "sync_status" "AcademicTaskSyncStatus" NOT NULL DEFAULT 'synced',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_classroom_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google_classroom',
    "google_account_id" TEXT NOT NULL,
    "google_email" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "GoogleConnectionStatus" NOT NULL DEFAULT 'connected',
    "last_error" TEXT,
    "last_error_at" TIMESTAMP(3),
    "last_synced_at" TIMESTAMP(3),
    "last_sync_summary" JSONB,
    "syncing_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_classroom_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_tasks_user_id_idx" ON "academic_tasks"("user_id");

-- CreateIndex
CREATE INDEX "academic_tasks_user_id_source_idx" ON "academic_tasks"("user_id", "source");

-- CreateIndex
CREATE UNIQUE INDEX "academic_tasks_user_id_external_course_id_external_coursewo_key" ON "academic_tasks"("user_id", "external_course_id", "external_coursework_id");

-- CreateIndex
CREATE INDEX "google_classroom_connections_user_id_idx" ON "google_classroom_connections"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_classroom_connections_user_id_provider_key" ON "google_classroom_connections"("user_id", "provider");

-- AddForeignKey
ALTER TABLE "academic_tasks" ADD CONSTRAINT "academic_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_classroom_connections" ADD CONSTRAINT "google_classroom_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;