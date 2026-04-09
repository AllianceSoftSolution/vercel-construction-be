-- Add SECTION_STORE to StoreType enum
ALTER TYPE "StoreType" ADD VALUE IF NOT EXISTS 'SECTION_STORE';

-- AlterTable stores: make sectionId nullable, add projectId and assignedUserId
ALTER TABLE "stores" ALTER COLUMN "sectionId" DROP NOT NULL;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "assignedUserId" TEXT;

-- Add foreign key for projectId
ALTER TABLE "stores" ADD CONSTRAINT "stores_project_fkey"
  FOREIGN KEY ("projectId") REFERENCES "projects"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Add foreign key for assignedUserId
ALTER TABLE "stores" ADD CONSTRAINT "stores_assigned_user_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
