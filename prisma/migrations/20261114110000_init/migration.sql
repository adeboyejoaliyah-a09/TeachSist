-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TeacherRole" AS ENUM ('teacher', 'school_admin');

-- CreateEnum
CREATE TYPE "SyncEntity" AS ENUM ('classes');

-- CreateEnum
CREATE TYPE "SyncOperation" AS ENUM ('upsert', 'delete');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('accepted', 'rejected');

-- CreateTable
CREATE TABLE "teachers" (
    "id" UUID NOT NULL,
    "role" "TeacherRole" NOT NULL DEFAULT 'teacher',
    "plan" TEXT NOT NULL DEFAULT 'default',
    "school_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schools" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "schools_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "grade_level" VARCHAR(80),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subjects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_class_subjects" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teacher_class_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_changes" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "change_id" UUID NOT NULL,
    "entity_type" "SyncEntity" NOT NULL,
    "entity_id" UUID NOT NULL,
    "operation" "SyncOperation" NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "result" JSONB NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teachers_school_id_idx" ON "teachers"("school_id");

-- CreateIndex
CREATE INDEX "teachers_updated_at_idx" ON "teachers"("updated_at");

-- CreateIndex
CREATE INDEX "schools_owner_id_idx" ON "schools"("owner_id");

-- CreateIndex
CREATE INDEX "schools_updated_at_idx" ON "schools"("updated_at");

-- CreateIndex
CREATE INDEX "classes_owner_id_updated_at_idx" ON "classes"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "classes_owner_id_deleted_at_idx" ON "classes"("owner_id", "deleted_at");

-- CreateIndex
CREATE INDEX "classes_updated_at_idx" ON "classes"("updated_at");

-- CreateIndex
CREATE INDEX "subjects_owner_id_updated_at_idx" ON "subjects"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "subjects_updated_at_idx" ON "subjects"("updated_at");

-- CreateIndex
CREATE INDEX "teacher_class_subjects_owner_id_idx" ON "teacher_class_subjects"("owner_id");

-- CreateIndex
CREATE INDEX "teacher_class_subjects_class_id_idx" ON "teacher_class_subjects"("class_id");

-- CreateIndex
CREATE INDEX "teacher_class_subjects_subject_id_idx" ON "teacher_class_subjects"("subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_class_subjects_teacher_id_class_id_subject_id_key" ON "teacher_class_subjects"("teacher_id", "class_id", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "sync_changes_sequence_key" ON "sync_changes"("sequence");

-- CreateIndex
CREATE INDEX "sync_changes_owner_id_sequence_idx" ON "sync_changes"("owner_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "sync_changes_owner_id_change_id_key" ON "sync_changes"("owner_id", "change_id");

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "schools"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schools" ADD CONSTRAINT "schools_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_class_subjects" ADD CONSTRAINT "teacher_class_subjects_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_class_subjects" ADD CONSTRAINT "teacher_class_subjects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_class_subjects" ADD CONSTRAINT "teacher_class_subjects_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_class_subjects" ADD CONSTRAINT "teacher_class_subjects_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_changes" ADD CONSTRAINT "sync_changes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "teachers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A relationship row must belong to the teacher it names, and classes start at version 1.
ALTER TABLE "teacher_class_subjects"
ADD CONSTRAINT "teacher_class_subjects_owner_matches_teacher"
CHECK ("owner_id" = "teacher_id");

ALTER TABLE "classes"
ADD CONSTRAINT "classes_version_positive"
CHECK ("version" > 0);

-- All application queries set this transaction-local value from the verified JWT subject.
ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teachers" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teachers_self_access" ON "teachers"
USING ("id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid)
WITH CHECK ("id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid);

ALTER TABLE "schools" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schools" FORCE ROW LEVEL SECURITY;
CREATE POLICY "schools_owner_access" ON "schools"
USING ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid)
WITH CHECK ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid);

ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "classes_owner_access" ON "classes"
USING ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid)
WITH CHECK ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid);

ALTER TABLE "subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "subjects_owner_access" ON "subjects"
USING ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid)
WITH CHECK ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid);

ALTER TABLE "teacher_class_subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teacher_class_subjects" FORCE ROW LEVEL SECURITY;
CREATE POLICY "teacher_class_subjects_owner_access" ON "teacher_class_subjects"
USING ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid)
WITH CHECK ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid);

ALTER TABLE "sync_changes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_changes" FORCE ROW LEVEL SECURITY;
CREATE POLICY "sync_changes_owner_access" ON "sync_changes"
USING ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid)
WITH CHECK ("owner_id" = NULLIF(current_setting('app.teacher_id', true), '')::uuid);
