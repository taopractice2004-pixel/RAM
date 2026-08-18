export type RoleName = "ADMIN" | "RMG" | "DELIVERY" | "HR" | "TA" | "VIEWER";

export type ResourceStatus = "AVAILABLE" | "ALLOCATED" | "BENCH_COMMITTED" | "BENCH_TRUE" | "TERMINATED";

export type AllocationStatus = "SCHEDULED" | "ACTIVE" | "CLOSED" | "CANCELLED";

export type TerminationStatus = "PENDING_HR_APPROVAL" | "APPROVED" | "REJECTED" | "COMPLETED";

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
  location: string;
  willingToRelocate: boolean;
  costRate: string | null;
  currency: string;
  portfolioId: string;
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
}

export interface Project {
  id: string;
  name: string;
  code: string;
  portfolioId: string;
  status: string;
  startDate: string;
  endDate: string | null;
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
  reasonCode: string;
  reason: string | null;
  status: TerminationStatus;
  createdAt: string;
  decidedAt: string | null;
  resource: Resource;
  initiatedBy: { id: string; name: string };
  hrApprover: { id: string; name: string } | null;
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
    agingTrueBench: number;
    utilizationRate: number;
  }[];
}
