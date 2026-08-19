-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "gender" "Gender" NOT NULL DEFAULT 'UNDISCLOSED';
