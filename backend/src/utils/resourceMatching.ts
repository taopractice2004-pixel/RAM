export interface MatchComponent {
  key: string;
  score: number;
  matched: string[];
  missing: string[];
  explanation: string;
}

export interface AllocationWindow {
  allocationPercent: number;
  startDate: Date;
  endDate: Date | null;
}

export interface MatchSkill {
  name: string;
  proficiency: number;
  yearsExperience: number;
}

export interface MatchCertification {
  name: string;
  issueDate: Date | null;
  expiryDate: Date | null;
}

export interface ResourceMatchCriteria {
  skills: string[];
  minProficiency?: number;
  minExperience?: number;
  certifications: string[];
  certificationDate: Date;
  location?: string;
  locations: string[];
  willingToRelocate: boolean;
  availableFte?: number;
  requiredFte?: number;
}

export function normalizeMatchText(value: string) {
  return value.trim().toLowerCase();
}

export function scoreResourceMatch(
  criteria: ResourceMatchCriteria,
  resourceSkills: MatchSkill[],
  resourceCertifications: MatchCertification[]
) {
  const skillsByName = new Map(resourceSkills.map((skill) => [normalizeMatchText(skill.name), skill]));
  const matchedSkills = criteria.skills.filter((name) => skillsByName.has(name));
  const missingSkills = criteria.skills.filter((name) => !skillsByName.has(name));
  const components: MatchComponent[] = [{
    key: "skills",
    score: matchedSkills.length / criteria.skills.length,
    matched: matchedSkills,
    missing: missingSkills,
    explanation: `${matchedSkills.length} of ${criteria.skills.length} requested skills matched`,
  }];

  if (criteria.minProficiency !== undefined || criteria.minExperience !== undefined) {
    let requestedChecks = 0;
    let satisfiedChecks = 0;
    const matchedChecks: string[] = [];
    const missingChecks: string[] = [];
    for (const skillName of criteria.skills) {
      const candidateSkill = skillsByName.get(skillName);
      if (criteria.minProficiency !== undefined) {
        requestedChecks += 1;
        const label = `${skillName}: proficiency >= ${criteria.minProficiency}`;
        if (candidateSkill && candidateSkill.proficiency >= criteria.minProficiency) {
          satisfiedChecks += 1;
          matchedChecks.push(label);
        } else {
          missingChecks.push(label);
        }
      }
      if (criteria.minExperience !== undefined) {
        requestedChecks += 1;
        const label = `${skillName}: experience >= ${criteria.minExperience} years`;
        if (candidateSkill && candidateSkill.yearsExperience >= criteria.minExperience) {
          satisfiedChecks += 1;
          matchedChecks.push(label);
        } else {
          missingChecks.push(label);
        }
      }
    }
    components.push({
      key: "qualifications",
      score: requestedChecks ? satisfiedChecks / requestedChecks : 0,
      matched: matchedChecks,
      missing: missingChecks,
      explanation: `${satisfiedChecks} of ${requestedChecks} requested proficiency/experience checks met`,
    });
  }

  if (criteria.certifications.length > 0) {
    const certificationNames = new Set(resourceCertifications
      .filter((item) =>
        (!item.issueDate || item.issueDate <= criteria.certificationDate) &&
        (!item.expiryDate || item.expiryDate >= criteria.certificationDate)
      )
      .map((item) => normalizeMatchText(item.name)));
    const matchedCertifications = criteria.certifications.filter((name) => certificationNames.has(name));
    const missingCertifications = criteria.certifications.filter((name) => !certificationNames.has(name));
    components.push({
      key: "certifications",
      score: matchedCertifications.length / criteria.certifications.length,
      matched: matchedCertifications,
      missing: missingCertifications,
      explanation: `${matchedCertifications.length} of ${criteria.certifications.length} requested certifications valid on ${criteria.certificationDate.toISOString().slice(0, 10)} matched`,
    });
  }

  if (criteria.location) {
    const requestedLocation = normalizeMatchText(criteria.location);
    const locationMatches = criteria.locations
      .map(normalizeMatchText)
      .includes(requestedLocation);
    const locationMatched = locationMatches || criteria.willingToRelocate;
    components.push({
      key: "location",
      score: locationMatched ? 1 : 0,
      matched: locationMatched ? [criteria.willingToRelocate && !locationMatches ? "willing to relocate" : criteria.location] : [],
      missing: locationMatched ? [] : [criteria.location],
      explanation: locationMatched
        ? criteria.willingToRelocate && !locationMatches ? "Candidate is willing to relocate" : "Requested location matched"
        : "Requested location did not match and candidate is not willing to relocate",
    });
  }

  if (criteria.requiredFte !== undefined && criteria.availableFte !== undefined) {
    const availabilityScore = Math.min(1, criteria.availableFte / criteria.requiredFte);
    components.push({
      key: "availability",
      score: availabilityScore,
      matched: criteria.availableFte >= criteria.requiredFte ? [`${criteria.availableFte.toFixed(2)} FTE available`] : [],
      missing: criteria.availableFte >= criteria.requiredFte ? [] : [`${criteria.requiredFte} FTE required; ${criteria.availableFte.toFixed(2)} FTE available`],
      explanation: `${criteria.availableFte.toFixed(2)} FTE available for the requested dates`,
    });
  }

  return {
    components,
    matchedSkills: matchedSkills.map((name) => skillsByName.get(name)!.name),
    matchScore: Math.round(components.reduce((sum, component) => sum + component.score, 0) / components.length * 100),
  };
}

export function getRecommendationStatusWeight(status: string) {
  return status === "AVAILABLE" ? 3
    : status === "BENCH_TRUE" ? 2
      : status === "BENCH_COMMITTED" ? 1
        : 0;
}

export function getRecommendationStatusTieBreakWeight(status: string) {
  return status === "ON_ML" ? -1 : getRecommendationStatusWeight(status);
}

export function getMaximumAllocatedFte(
  allocations: AllocationWindow[],
  rangeStart: Date,
  rangeEnd: Date
) {
  const start = rangeStart.getTime();
  const end = inclusiveEndBoundary(rangeEnd);
  const events: Array<{ at: number; delta: number }> = [];

  for (const allocation of allocations) {
    const allocationStart = allocation.startDate.getTime();
    const allocationEnd = allocation.endDate ? inclusiveEndBoundary(allocation.endDate) : end;
    const overlapStart = Math.max(start, allocationStart);
    const overlapEnd = Math.min(end, allocationEnd);
    if (overlapStart >= overlapEnd) continue;

    events.push(
      { at: overlapStart, delta: allocation.allocationPercent },
      { at: overlapEnd, delta: -allocation.allocationPercent }
    );
  }

  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let allocatedPercent = 0;
  let maximumAllocatedPercent = 0;

  for (let index = 0; index < events.length;) {
    const at = events[index].at;
    while (index < events.length && events[index].at === at) {
      allocatedPercent += events[index].delta;
      index += 1;
    }
    maximumAllocatedPercent = Math.max(maximumAllocatedPercent, allocatedPercent);
  }

  return maximumAllocatedPercent / 100;
}

export function getAvailableFte(
  allocations: AllocationWindow[],
  status: string,
  rangeStart: Date,
  rangeEnd: Date
) {
  if (status === "ON_ML" || status === "TERMINATED") return 0;
  return Math.round(Math.max(0, 1 - getMaximumAllocatedFte(allocations, rangeStart, rangeEnd)) * 100) / 100;
}

function inclusiveEndBoundary(value: Date) {
  const boundary = new Date(value);
  if (
    boundary.getUTCHours() === 0 &&
    boundary.getUTCMinutes() === 0 &&
    boundary.getUTCSeconds() === 0 &&
    boundary.getUTCMilliseconds() === 0
  ) {
    boundary.setUTCDate(boundary.getUTCDate() + 1);
  }
  return boundary.getTime();
}
