-- DropForeignKey
ALTER TABLE "accountant_assignments" DROP CONSTRAINT "accountant_assignments_sectionId_fkey";

-- AlterTable
ALTER TABLE "accountant_assignments" ALTER COLUMN "sectionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "accountant_assignments" ADD CONSTRAINT "accountant_assignments_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
