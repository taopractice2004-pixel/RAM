-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING_HR_APPROVAL', 'APPROVED', 'REJECTED', 'COMPLETED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ML_APPROVAL_NEEDED';

-- AlterEnum
ALTER TYPE "ResourceStatus" ADD VALUE 'ON_ML';

-- AlterTable
ALTER TABLE "Allocation" ADD COLUMN     "projectReportingManagerName" TEXT,
ADD COLUMN     "roleOnProject" TEXT;

-- AlterTable
ALTER TABLE "Portfolio" ADD COLUMN     "managerName" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "billingDelayed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isInternalProject" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "country" TEXT,
ADD COLUMN     "dateOfJoining" TIMESTAMP(3),
ADD COLUMN     "designation" TEXT,
ADD COLUMN     "managerName" TEXT,
ADD COLUMN     "priorExperienceYears" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "subCategory" TEXT,
ADD COLUMN     "workLocation" TEXT;

-- CreateTable
CREATE TABLE "MaternityLeaveRequest" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "initiatedById" TEXT NOT NULL,
    "reason" TEXT,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING_HR_APPROVAL',
    "hrApproverId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaternityLeaveRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "MaternityLeaveRequest" ADD CONSTRAINT "MaternityLeaveRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaternityLeaveRequest" ADD CONSTRAINT "MaternityLeaveRequest_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaternityLeaveRequest" ADD CONSTRAINT "MaternityLeaveRequest_hrApproverId_fkey" FOREIGN KEY ("hrApproverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
