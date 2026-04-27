-- CreateTable
CREATE TABLE "store_permissions" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canViewStock" BOOLEAN NOT NULL DEFAULT true,
    "canRequestMaterials" BOOLEAN NOT NULL DEFAULT false,
    "canApproveMaterials" BOOLEAN NOT NULL DEFAULT false,
    "canAddStock" BOOLEAN NOT NULL DEFAULT false,
    "canTransferStock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "store_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_permissions_userId_storeId_key" ON "store_permissions"("userId", "storeId");

-- AddForeignKey
ALTER TABLE "store_permissions" ADD CONSTRAINT "store_permissions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_permissions" ADD CONSTRAINT "store_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
