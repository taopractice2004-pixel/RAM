export type RoleName = "ADMIN" | "RMG" | "DELIVERY" | "HR" | "TA" | "VIEWER";
export type Gender = "FEMALE" | "MALE" | "OTHER" | "UNDISCLOSED";

export type ResourceStatus = "AVAILABLE" | "ALLOCATED" | "BENCH_COMMITTED" | "BENCH_TRUE" | "ON_ML" | "TERMINATED";

export type AllocationStatus = "SCHEDULED" | "ACTIVE" | "CLOSED" | "CANCELLED";

export type TerminationStatus = "PENDING_HR_APPROVAL" | "APPROVED" | "REJECTED" | "COMPLETED";

export type ApprovalRequestType = "TERMINATION" | "ML";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: RoleName;
  authorizedPortfolioIds: string[];
}

export interface Portfolio {
  id: string;
  name: string;
  code: string;
  managerName?: string | null;
}

export interface Skill {
  id: string;
  name: string;
}

export interface ResourceSkill {
  id: string;
  skillId: string;
  proficiency: number;
  yearsExperience: number;
  skill: Skill;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string | null;
  issueDate: string | null;
  expiryDate: string | null;
}

export interface PerformanceRecord {
  id: string;
  rating: string;
  pipStatus: boolean;
  reviewDate: string;
  notes: string | null;
}

export interface Resource {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  gender?: Gender;
  country?: string | null;
  workLocation?: string | null;
  location: string;
  willingToRelocate: boolean;
  costRate: string | null;
  currency: string;
  portfolioId: string;
  managerName?: string | null;
  designation?: string | null;
  subCategory?: string | null;
  dateOfJoining?: string | null;
  priorExperienceYears?: number;
  taoExperienceYears?: number;
  totalYearsExperience?: number;
  status: ResourceStatus;
  benchSince: string | null;
  sourceSystem: string;
  portfolio: Portfolio;
  skills: ResourceSkill[];
  certifications: Certification[];
  performanceRecords?: PerformanceRecord[];
  allocations?: Allocation[];
  daysOnBench?: number | null;
  nextScheduledAllocation?: Allocation | null;
  projectedBenchStartDate?: string | null;
  totalAllocatedPercent?: number;
  availablePercentForDeployment?: number;
  overallFte?: number;
  empCount?: number;
}

export interface ResourceRecommendation {
  resource: Resource;
  matchCount: number;
  matchedSkills: string[];
  statusWeight: number;
  score: number;
  matchScore: number;
  pipStatus?: boolean | null;
  components: {
    key: string;
    score: number;
    matched: string[];
    missing: string[];
    explanation: string;
  }[];
  availableFte?: number;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  portfolioId: string;
  billingDelayed?: boolean;
  isInternalProject?: boolean;
  status: string;
  startDate: string;
  endDate: string | null;
  portfolio?: Portfolio;
  tasks?: Task[];
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
}

export interface Allocation {
  id: string;
  resourceId: string;
  projectId: string;
  taskId: string | null;
  portfolioId: string;
  allocationPercent: number;
  roleOnProject?: string | null;
  projectReportingManagerName?: string | null;
  startDate: string;
  endDate: string | null;
  status: AllocationStatus;
  notes: string | null;
  resource?: Resource;
  project?: Project;
  task?: Task | null;
  createdBy?: { id: string; name: string };
}

export interface TerminationRequest {
  id: string;
  resourceId: string;
  requestType?: ApprovalRequestType;
  reasonCode: string;
  reason: string | null;
  status: TerminationStatus;
  createdAt: string;
  decidedAt: string | null;
  resource: Resource;
  initiatedBy: { id: string; name: string };
  hrApprover: { id: string; name: string } | null;
}

export interface MaternityLeaveRequest {
  id: string;
  resourceId: string;
  requestType?: ApprovalRequestType;
  reason: string | null;
  status: TerminationStatus;
  createdAt: string;
  decidedAt: string | null;
  resource: Resource;
  initiatedBy: { id: string; name: string };
  hrApprover: { id: string; name: string } | null;
}

export type ApprovalRequest = TerminationRequest | MaternityLeaveRequest;

export interface DemandRequest {
  id: string;
  portfolioId: string;
  projectName: string;
  projectCode?: string | null;
  clientName?: string | null;
  roleName: string;
  location?: string | null;
  requiredSkills: string[];
  minProficiency?: number | null;
  minExperienceYears?: number | null;
  requiredCertifications: string[];
  requiredFte: number | string;
  startDate: string;
  endDate?: string | null;
  status: "DRAFT" | "PIPELINE" | "COMMITTED" | "FULFILLED" | "CANCELLED";
  confidenceStage: "DRAFT" | "PIPELINE" | "COMMITTED" | "FULFILLED" | "CANCELLED";
  ownerId?: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  portfolio?: Portfolio;
  document?: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    updatedAt: string;
  } | null;
}

export interface Notification {
  id: string;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

export interface ImportBatch {
  id: string;
  source: string;
  status: string;
  createdCount: number;
  updatedCount: number;
  quarantinedCount: number;
  startedAt: string;
  completedAt: string | null;
}

export interface ImportRecord {
  id: string;
  batchId: string;
  employeeId: string;
  rawData: Record<string, string>;
  status: string;
  errors: string[] | null;
}

export interface DashboardSummary {
  statusCounts: { status: ResourceStatus; count: number }[];
  totalActiveResources: number;
  utilizationRate: number;
  activeAllocationsCount: number;
  byPortfolio: {
    portfolioId: string;
    portfolioName: string;
    totalActiveResources: number;
    allocated: number;
    benchCommitted: number;
    benchTrue: number;
    onMl?: number;
    agingTrueBench: number;
    utilizationRate: number;
  }[];
}
