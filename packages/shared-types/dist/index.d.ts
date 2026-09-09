export declare enum Role {
    ADMIN = "ADMIN",
    RMG = "RMG",
    DELIVERY = "DELIVERY",
    HR = "HR",
    TA = "TA",
    VIEWER = "VIEWER"
}
export declare enum LifecycleState {
    AVAILABLE = "AVAILABLE",
    ALLOCATED = "ALLOCATED",
    BENCH_COMMITTED = "BENCH_COMMITTED",
    BENCH_TRUE = "BENCH_TRUE",
    TERMINATED = "TERMINATED"
}
export declare enum ResourceType {
    EMPLOYEE = "EMPLOYEE",
    CONTRACTOR = "CONTRACTOR"
}
export declare enum AllocationStatus {
    SCHEDULED = "SCHEDULED",
    ACTIVE = "ACTIVE",
    CLOSED = "CLOSED",
    CANCELLED = "CANCELLED"
}
export declare enum BenchType {
    COMMITTED = "COMMITTED",
    TRUE = "TRUE"
}
export declare enum TerminationStatus {
    PENDING_HR_APPROVAL = "PENDING_HR_APPROVAL",
    APPROVED = "APPROVED",
    CANCELLED = "CANCELLED"
}
export declare enum TerminationReasonCode {
    VOLUNTARY = "VOLUNTARY",
    INVOLUNTARY = "INVOLUNTARY",
    END_OF_CONTRACT = "END_OF_CONTRACT",
    TRANSFER_OUT_OF_SCOPE = "TRANSFER_OUT_OF_SCOPE"
}
export declare enum ProficiencyLevel {
    BEGINNER = "BEGINNER",
    INTERMEDIATE = "INTERMEDIATE",
    ADVANCED = "ADVANCED",
    EXPERT = "EXPERT"
}
export interface LoginRequest {
    email: string;
    password: string;
}
export interface AuthUser {
    id: string;
    email: string;
    fullName: string;
    role: Role;
}
export interface LoginResponse {
    accessToken: string;
    user: AuthUser;
}
export interface AdminUserSummary {
    id: string;
    email: string;
    fullName: string;
    role: Role;
    accountStatus: 'ACTIVE' | 'DISABLED';
    linkedResourceId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface PortfolioSummary {
    id: string;
    code: string;
    name: string;
    parentId: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface PortfolioAuthorizationSummary {
    id: string;
    userId: string;
    portfolioId: string;
    grantedById: string;
    grantedAt: string;
    revokedAt: string | null;
}
export interface GuardrailConfigSummary {
    id: string;
    configType: string;
    value: number;
    portfolioId: string | null;
    setById: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface ResourceSkillSummary {
    id: string;
    skillId: string;
    name: string;
    category: string | null;
    proficiencyLevel: ProficiencyLevel;
    yearsInSkill: string | null;
    lastUsedDate: string | null;
}
export interface SkillSummary {
    id: string;
    name: string;
    category: string | null;
}
export interface ResourceListItem {
    id: string;
    fullName: string;
    resourceType: ResourceType;
    email: string;
    employeeOrContractorNo: string;
    homePortfolio: {
        id: string;
        code: string;
        name: string;
    };
    jobTitle: string;
    location: string;
    timezone: string | null;
    totalYearsExperience: string | null;
    dateOfJoining: string;
    lifecycleState: LifecycleState;
    currentAllocatedPct: number;
    capacityPct: number;
    currency: string;
    recordStatus: 'ACTIVE' | 'QUARANTINED';
    sourceSystem: string;
    createdAt: string;
    updatedAt: string;
    costRate: string | null;
    billingRate: string | null;
    skills: ResourceSkillSummary[];
}
export interface SyncLogSummary {
    id: string;
    runDate: string;
    sourceSystem: string;
    recordsCreated: number;
    recordsUpdated: number;
    recordsQuarantined: number;
    status: 'SUCCESS' | 'PARTIAL_FAILURE' | 'FAILED';
}
export interface QuarantinedRecordSummary {
    id: string;
    syncId: string;
    rawPayload: unknown;
    validationErrors: unknown;
    status: 'PENDING' | 'RESOLVED';
    resolvedById: string | null;
    resolvedAt: string | null;
}
export interface AllocationSummary {
    id: string;
    resourceId: string;
    projectId: string;
    roleOnProject: string | null;
    startDate: string;
    endDate: string;
    actualEndDate: string | null;
    allocationPct: number;
    billable: boolean;
    status: AllocationStatus;
    rateSnapshot: string | null;
    createdById: string;
    approvedById: string | null;
    createdAt: string;
    updatedAt: string;
    resource: {
        id: string;
        fullName: string;
        homePortfolioId: string;
    };
    project: {
        id: string;
        name: string;
        code: string;
        portfolioId: string;
    };
}
export interface AllocationConflict {
    type: 'OVER_ALLOCATION' | 'UNAUTHORIZED' | 'INVALID_RESOURCE' | 'INVALID_PROJECT';
    message: string;
    currentAllocatedPct?: number;
    requestedAllocationPct?: number;
    overlappingAllocations?: Array<{
        id: string;
        projectCode: string;
        allocationPct: number;
        startDate: string;
        endDate: string;
    }>;
}
export interface BenchRecordSummary {
    id: string;
    resourceId: string;
    benchStartDate: string;
    benchType: BenchType;
    scheduledNextAllocationId: string | null;
    benchEndDate: string | null;
    agingDays: number;
    alertSent: boolean;
    createdAt: string;
    updatedAt: string;
    resource: {
        id: string;
        fullName: string;
        homePortfolioId: string;
    };
}
export interface AuditLogEntry {
    id: string;
    entityType: string;
    entityId: string | null;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'STATE_TRANSITION' | 'LOGIN' | 'UNAUTHORIZED_ATTEMPT';
    actorUserId: string | null;
    oldValue: unknown;
    newValue: unknown;
    reasonCode: string | null;
    createdAt: string;
}
export interface TerminationRecordSummary {
    id: string;
    resourceId: string;
    terminationDate: string;
    reasonCode: string;
    status: TerminationStatus;
    initiatedById: string;
    hrApprovedById: string | null;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
    resource: {
        id: string;
        fullName: string;
        homePortfolioId: string;
    };
}
