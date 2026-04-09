-- DropForeignKey
ALTER TABLE "stores" DROP CONSTRAINT "stores_section_fkey";

-- AddForeignKey
ALTER TABLE "stores" ADD CONSTRAINT "stores_section_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
