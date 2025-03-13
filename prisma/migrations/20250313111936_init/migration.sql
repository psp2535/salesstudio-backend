/*
  Warnings:

  - You are about to drop the column `claimedAt` on the `Coupon` table. All the data in the column will be lost.
  - You are about to drop the column `claimedBy` on the `Coupon` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Counter" ALTER COLUMN "id" SET DEFAULT 1,
ALTER COLUMN "id" DROP DEFAULT;
DROP SEQUENCE "Counter_id_seq";

-- AlterTable
ALTER TABLE "Coupon" DROP COLUMN "claimedAt",
DROP COLUMN "claimedBy";

-- CreateTable
CREATE TABLE "ClaimHistory" (
    "id" SERIAL NOT NULL,
    "couponId" INTEGER NOT NULL,
    "claimedBy" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimHistory_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ClaimHistory" ADD CONSTRAINT "ClaimHistory_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
