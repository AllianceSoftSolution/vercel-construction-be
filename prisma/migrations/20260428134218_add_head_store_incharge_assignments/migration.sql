-- CreateTable
CREATE TABLE "head_store_incharge_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "head_store_incharge_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "head_store_incharge_assignments_userId_projectId_key" ON "head_store_incharge_assignments"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "head_store_incharge_assignments" ADD CONSTRAINT "head_store_incharge_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "head_store_incharge_assignments" ADD CONSTRAINT "head_store_incharge_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
