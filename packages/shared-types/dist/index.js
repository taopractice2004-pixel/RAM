export var Role;
(function (Role) {
    Role["ADMIN"] = "ADMIN";
    Role["RMG"] = "RMG";
    Role["DELIVERY"] = "DELIVERY";
    Role["HR"] = "HR";
    Role["TA"] = "TA";
    Role["VIEWER"] = "VIEWER";
})(Role || (Role = {}));
export var LifecycleState;
(function (LifecycleState) {
    LifecycleState["AVAILABLE"] = "AVAILABLE";
    LifecycleState["ALLOCATED"] = "ALLOCATED";
    LifecycleState["BENCH_COMMITTED"] = "BENCH_COMMITTED";
    LifecycleState["BENCH_TRUE"] = "BENCH_TRUE";
    LifecycleState["TERMINATED"] = "TERMINATED";
})(LifecycleState || (LifecycleState = {}));
export var ResourceType;
(function (ResourceType) {
    ResourceType["EMPLOYEE"] = "EMPLOYEE";
    ResourceType["CONTRACTOR"] = "CONTRACTOR";
})(ResourceType || (ResourceType = {}));
export var AllocationStatus;
(function (AllocationStatus) {
    AllocationStatus["SCHEDULED"] = "SCHEDULED";
    AllocationStatus["ACTIVE"] = "ACTIVE";
    AllocationStatus["CLOSED"] = "CLOSED";
    AllocationStatus["CANCELLED"] = "CANCELLED";
})(AllocationStatus || (AllocationStatus = {}));
export var BenchType;
(function (BenchType) {
    BenchType["COMMITTED"] = "COMMITTED";
    BenchType["TRUE"] = "TRUE";
})(BenchType || (BenchType = {}));
export var TerminationStatus;
(function (TerminationStatus) {
    TerminationStatus["PENDING_HR_APPROVAL"] = "PENDING_HR_APPROVAL";
    TerminationStatus["APPROVED"] = "APPROVED";
    TerminationStatus["CANCELLED"] = "CANCELLED";
})(TerminationStatus || (TerminationStatus = {}));
export var TerminationReasonCode;
(function (TerminationReasonCode) {
    TerminationReasonCode["VOLUNTARY"] = "VOLUNTARY";
    TerminationReasonCode["INVOLUNTARY"] = "INVOLUNTARY";
    TerminationReasonCode["END_OF_CONTRACT"] = "END_OF_CONTRACT";
    TerminationReasonCode["TRANSFER_OUT_OF_SCOPE"] = "TRANSFER_OUT_OF_SCOPE";
})(TerminationReasonCode || (TerminationReasonCode = {}));
export var ProficiencyLevel;
(function (ProficiencyLevel) {
    ProficiencyLevel["BEGINNER"] = "BEGINNER";
    ProficiencyLevel["INTERMEDIATE"] = "INTERMEDIATE";
    ProficiencyLevel["ADVANCED"] = "ADVANCED";
    ProficiencyLevel["EXPERT"] = "EXPERT";
})(ProficiencyLevel || (ProficiencyLevel = {}));
