import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

async function main() {
  console.log("Seeding RAM database...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Keep seed idempotent so repeated runs do not stack lifecycle records and distort derived metrics.
  await prisma.maternityLeaveRequest.deleteMany();
  await prisma.terminationRequest.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.demandRequest.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.performanceRecord.deleteMany();
  await prisma.certification.deleteMany();
  await prisma.resourceSkill.deleteMany();

  // ---------- Portfolios ----------
  const [fin, health, publicSector] = await Promise.all([
    prisma.portfolio.upsert({ where: { code: "FIN" }, create: { code: "FIN", name: "Fintech", managerName: "Venkat" }, update: { name: "Fintech", managerName: "Venkat" } }),
    prisma.portfolio.upsert({ where: { code: "HC" }, create: { code: "HC", name: "Healthcare", managerName: "Dhanasekar / Adharsh" }, update: { name: "Healthcare", managerName: "Dhanasekar / Adharsh" } }),
    prisma.portfolio.upsert({ where: { code: "PS" }, create: { code: "PS", name: "Media & HiTech", managerName: "Laxman" }, update: { name: "Media & HiTech", managerName: "Laxman" } }),
  ]);
  const [autoIndustrial, broadcom, aiMl] = await Promise.all([
    prisma.portfolio.upsert({ where: { code: "AUTO" }, create: { code: "AUTO", name: "Auto & Industrial", managerName: "Viswa" }, update: { name: "Auto & Industrial", managerName: "Viswa" } }),
    prisma.portfolio.upsert({ where: { code: "BCM" }, create: { code: "BCM", name: "Broadcom", managerName: "Shantanu/Raja" }, update: { name: "Broadcom", managerName: "Shantanu/Raja" } }),
    prisma.portfolio.upsert({ where: { code: "AIML" }, create: { code: "AIML", name: "AI/ML Internal", managerName: "Vamsi" }, update: { name: "AI/ML Internal", managerName: "Vamsi" } }),
  ]);

  const existingGlobalBenchConfig = await prisma.benchConfig.findFirst({ where: { portfolioId: null } });
  if (!existingGlobalBenchConfig) {
    await prisma.benchConfig.create({ data: { portfolioId: null, committedWindowDays: 14, trueBenchAgingThresholdDays: 30 } });
  }

  // ---------- Users ----------
  const admin = await prisma.user.upsert({
    where: { email: "admin@ram.com" },
    create: { email: "admin@ram.com", name: "Ana Administrator", role: "ADMIN", passwordHash },
    update: {},
  });
  const rmg = await prisma.user.upsert({
    where: { email: "rmg@ram.com" },
    create: { email: "rmg@ram.com", name: "Raj Mehta (RMG)", role: "RMG", passwordHash },
    update: {},
  });
  const rmg2 = await prisma.user.upsert({
    where: { email: "rmg2@ram.com" },
    create: { email: "rmg2@ram.com", name: "Priya Nair (RMG)", role: "RMG", passwordHash },
    update: {},
  });
  const delFin = await prisma.user.upsert({
    where: { email: "delivery.fin@ram.com" },
    create: { email: "delivery.fin@ram.com", name: "Diego Delivery (Financial Services)", role: "DELIVERY", passwordHash },
    update: {},
  });
  const delHealth = await prisma.user.upsert({
    where: { email: "delivery.health@ram.com" },
    create: { email: "delivery.health@ram.com", name: "Hana Delivery (Healthcare)", role: "DELIVERY", passwordHash },
    update: {},
  });
  const hr = await prisma.user.upsert({
    where: { email: "hr@ram.com" },
    create: { email: "hr@ram.com", name: "Helen Rhodes (HR)", role: "HR", passwordHash },
    update: {},
  });
  const ta = await prisma.user.upsert({
    where: { email: "ta@ram.com" },
    create: { email: "ta@ram.com", name: "Tariq Ahmed (TA)", role: "TA", passwordHash },
    update: {},
  });
  const viewer = await prisma.user.upsert({
    where: { email: "viewer@ram.com" },
    create: { email: "viewer@ram.com", name: "Vera Viewer", role: "VIEWER", passwordHash },
    update: {},
  });

  // ---------- Portfolio authorizations ----------
  const grants: [string, string][] = [
    [rmg.id, fin.id],
    [rmg.id, health.id],
    [rmg.id, publicSector.id],
    [rmg.id, autoIndustrial.id],
    [rmg.id, broadcom.id],
    [rmg.id, aiMl.id],
    [rmg2.id, fin.id],
    [rmg2.id, health.id],
    [rmg2.id, publicSector.id],
    [rmg2.id, autoIndustrial.id],
    [rmg2.id, broadcom.id],
    [rmg2.id, aiMl.id],
    [delFin.id, fin.id],
    [delHealth.id, health.id],
    [viewer.id, fin.id],
  ];
  for (const [userId, portfolioId] of grants) {
    await prisma.portfolioAuthorization.upsert({
      where: { userId_portfolioId: { userId, portfolioId } },
      create: { userId, portfolioId, grantedById: admin.id },
      update: { isActive: true, revokedAt: null },
    });
  }

  // ---------- Skills ----------
  const skillNames = ["React", "Node.js", "Java", "SQL", "AWS", "Project Management", "Data Science", "DevOps", "Salesforce", "Python", "Kubernetes", "Change Management"];
  const skills: Record<string, string> = {};
  for (const name of skillNames) {
    const s = await prisma.skill.upsert({ where: { name }, create: { name }, update: {} });
    skills[name] = s.id;
  }

  // ---------- Projects ----------
  const projectDefs = [
    { code: "FIN-P1", name: "Core Banking Modernization", portfolioId: fin.id },
    { code: "FIN-P2", name: "Fraud Analytics Platform", portfolioId: fin.id },
    { code: "HC-P1", name: "Patient Portal Revamp", portfolioId: health.id },
    { code: "PS-P1", name: "Citizen Services Portal", portfolioId: publicSector.id },
    { code: "AUTO-P1", name: "Plant Analytics Rollout", portfolioId: autoIndustrial.id },
    { code: "BCM-P1", name: "Broadcom Platform Support", portfolioId: broadcom.id },
    { code: "AIML-P1", name: "AI Knowledge Assistant", portfolioId: aiMl.id, isInternalProject: true },
  ];
  const projects: Record<string, any> = {};
  for (const p of projectDefs) {
    projects[p.code] = await prisma.project.upsert({
      where: { code: p.code },
        create: { ...p, status: "ACTIVE", startDate: new Date("2025-01-01"), billingDelayed: p.code === "BCM-P1" },
        update: {},
      });
  }

  const tasksByProject: Record<string, any> = {};
  for (const code of Object.keys(projects)) {
    tasksByProject[code] = await prisma.task.create({
      data: { projectId: projects[code].id, name: `${projects[code].name} - Delivery Track`, startDate: new Date("2025-01-01") },
    });
  }

  // ---------- Resources ----------
  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);

  interface ResourceDef {
    employeeId: string;
    name: string;
    email: string;
    location: string;
    portfolioId: string;
    costRate: number;
    skillSet: [string, number, number][]; // name, proficiency, years
    willingToRelocate?: boolean;
    country?: string;
    gender?: "FEMALE" | "MALE" | "OTHER" | "UNDISCLOSED";
    workLocation?: string;
    managerName?: string;
    designation?: string;
    subCategory?: string;
    dateOfJoining?: string;
    priorExperienceYears?: number;
  }

  const resourceDefs: ResourceDef[] = [
    { employeeId: "E1001", name: "Alicia Chen", email: "alicia.chen@corp.com", location: "Santa Clara, California", country: "USA", gender: "FEMALE", workLocation: "Santa Clara, California", managerName: "Venkat", designation: "Engineering Lead", dateOfJoining: "2022-03-01", priorExperienceYears: 5, portfolioId: fin.id, costRate: 145, skillSet: [["React", 5, 6], ["Node.js", 4, 5]] },
    { employeeId: "E1002", name: "Brian Walsh", email: "brian.walsh@corp.com", location: "Toronto, Ontario", country: "Canada", gender: "MALE", workLocation: "Toronto, Ontario", managerName: "Venkat", designation: "Senior Java Engineer", dateOfJoining: "2021-09-15", priorExperienceYears: 6.5, portfolioId: fin.id, costRate: 130, skillSet: [["Java", 5, 8], ["SQL", 4, 8]] },
    { employeeId: "E1003", name: "Carla Gomez", email: "carla.gomez@corp.com", location: "Hyderabad - JVP", country: "India", gender: "FEMALE", workLocation: "Hyderabad - JVP", managerName: "Venkat", designation: "Data Scientist", dateOfJoining: "2024-01-10", priorExperienceYears: 4, portfolioId: fin.id, costRate: 160, skillSet: [["Data Science", 5, 5], ["Python", 5, 6]], willingToRelocate: true, subCategory: "Committed Bench" },
    { employeeId: "E1004", name: "Devon Park", email: "devon.park@corp.com", location: "Remote", country: "India", gender: "MALE", workLocation: "Remote", managerName: "Venkat", designation: "Cloud Engineer", dateOfJoining: "2025-01-05", priorExperienceYears: 1, portfolioId: fin.id, costRate: 120, skillSet: [["AWS", 4, 4], ["DevOps", 4, 4]], subCategory: "Proactive Hire" },
    { employeeId: "E1005", name: "Elena Petrova", email: "elena.petrova@corp.com", location: "Westmead, New South Wales", country: "Australia", gender: "FEMALE", workLocation: "Westmead, New South Wales", managerName: "Dhanasekar", designation: "Program Manager", dateOfJoining: "2020-07-01", priorExperienceYears: 8, portfolioId: health.id, costRate: 150, skillSet: [["Project Management", 5, 10]] },
    { employeeId: "E1006", name: "Farid Haidari", email: "farid.haidari@corp.com", location: "Nangang District, Taipei City", country: "Taiwan", gender: "MALE", workLocation: "Nangang District, Taipei City", managerName: "Adharsh", designation: "Full Stack Engineer", dateOfJoining: "2023-11-20", priorExperienceYears: 2.5, portfolioId: health.id, costRate: 135, skillSet: [["React", 4, 4], ["Node.js", 3, 3]] },
    { employeeId: "E1007", name: "Grace Lee", email: "grace.lee@corp.com", location: "Chennai", country: "India", gender: "FEMALE", workLocation: "Chennai", managerName: "Adharsh", designation: "Data Analyst", dateOfJoining: "2021-02-15", priorExperienceYears: 3.5, portfolioId: health.id, costRate: 155, skillSet: [["Data Science", 4, 4], ["SQL", 4, 5]], subCategory: "Bench" },
    { employeeId: "E1008", name: "Hassan Ali", email: "hassan.ali@corp.com", location: "Hyderabad - CyberGateway", country: "India", gender: "MALE", workLocation: "Hyderabad - CyberGateway", managerName: "Laxman", designation: "Change Manager", dateOfJoining: "2023-06-12", priorExperienceYears: 2, portfolioId: publicSector.id, costRate: 110, skillSet: [["Salesforce", 4, 3], ["Change Management", 3, 3]], subCategory: "Corporate Bench" },
    { employeeId: "E1009", name: "Ingrid Sorensen", email: "ingrid.sorensen@corp.com", location: "Remote", country: "India", gender: "FEMALE", workLocation: "Remote", managerName: "Viswa", designation: "Platform Engineer", dateOfJoining: "2024-05-02", priorExperienceYears: 2, portfolioId: autoIndustrial.id, costRate: 140, skillSet: [["Kubernetes", 4, 3], ["AWS", 3, 3]] },
    { employeeId: "E1010", name: "Jamal Robinson", email: "jamal.robinson@corp.com", location: "Santa Clara, California", country: "USA", gender: "MALE", workLocation: "Santa Clara, California", managerName: "Shantanu", designation: "Associate Intern", dateOfJoining: "2025-05-15", priorExperienceYears: 0, portfolioId: broadcom.id, costRate: 125, skillSet: [["Java", 3, 3], ["Project Management", 3, 2]], subCategory: "Interns" },
    { employeeId: "E1011", name: "Kavya Iyer", email: "kavya.iyer@corp.com", location: "Hyderabad - JVP", country: "India", gender: "FEMALE", workLocation: "Hyderabad - JVP", managerName: "Vamsi", designation: "ML Engineer", dateOfJoining: "2022-08-10", priorExperienceYears: 3, portfolioId: aiMl.id, costRate: 132, skillSet: [["Python", 4, 4], ["Data Science", 3, 3]], subCategory: "Internal Project" },
    { employeeId: "E1012", name: "Liam O'Connor", email: "liam.oconnor@corp.com", location: "Visakhapatnam", country: "India", gender: "MALE", workLocation: "Visakhapatnam", managerName: "Laxman", designation: "Business Analyst", dateOfJoining: "2025-02-01", priorExperienceYears: 1.5, portfolioId: publicSector.id, costRate: 118, skillSet: [["SQL", 3, 3], ["Salesforce", 3, 2]] },
    { employeeId: "E1013", name: "Ananya Nair", email: "ananya.nair@corp.com", location: "Bengaluru, Karnataka", country: "India", gender: "FEMALE", workLocation: "Bengaluru, Karnataka", managerName: "Venkat", designation: "Senior Frontend Engineer", dateOfJoining: "2020-09-14", priorExperienceYears: 6, portfolioId: fin.id, costRate: 155, skillSet: [["React", 5, 7], ["Node.js", 4, 5]], willingToRelocate: true },
    { employeeId: "E1014", name: "Rohit Sharma", email: "rohit.sharma@corp.com", location: "Pune, Maharashtra", country: "India", gender: "MALE", workLocation: "Pune, Maharashtra", managerName: "Dhanasekar", designation: "Java Backend Engineer", dateOfJoining: "2021-05-20", priorExperienceYears: 5.5, portfolioId: health.id, costRate: 148, skillSet: [["Java", 5, 6], ["SQL", 4, 5]], willingToRelocate: true },
    { employeeId: "E1015", name: "Priya Sethi", email: "priya.sethi@corp.com", location: "New Delhi, Delhi", country: "India", gender: "FEMALE", workLocation: "New Delhi, Delhi", managerName: "Vamsi", designation: "Data Engineer", dateOfJoining: "2023-02-11", priorExperienceYears: 3, portfolioId: aiMl.id, costRate: 136, skillSet: [["Data Science", 4, 4], ["Python", 5, 5], ["SQL", 4, 4]], willingToRelocate: true },
    { employeeId: "E1016", name: "Vikas Reddy", email: "vikas.reddy@corp.com", location: "Hyderabad, Telangana", country: "India", gender: "MALE", workLocation: "Hyderabad, Telangana", managerName: "Viswa", designation: "Cloud Platform Engineer", dateOfJoining: "2022-11-08", priorExperienceYears: 4.5, portfolioId: autoIndustrial.id, costRate: 142, skillSet: [["AWS", 5, 5], ["Kubernetes", 4, 4], ["DevOps", 4, 4]], willingToRelocate: false },
    { employeeId: "E1017", name: "Neha Kulkarni", email: "neha.kulkarni@corp.com", location: "Mumbai, Maharashtra", country: "India", gender: "FEMALE", workLocation: "Mumbai, Maharashtra", managerName: "Laxman", designation: "Change Manager", dateOfJoining: "2019-07-23", priorExperienceYears: 7, portfolioId: publicSector.id, costRate: 150, skillSet: [["Change Management", 5, 8], ["Project Management", 5, 7]], willingToRelocate: false },
    { employeeId: "E1018", name: "Arjun Menon", email: "arjun.menon@corp.com", location: "Kochi, Kerala", country: "India", gender: "MALE", workLocation: "Remote / Kochi", managerName: "Venkat", designation: "Python Developer", dateOfJoining: "2024-03-01", priorExperienceYears: 2.5, portfolioId: fin.id, costRate: 130, skillSet: [["Python", 4, 3], ["SQL", 3, 3], ["AWS", 3, 2]], willingToRelocate: true },
  ];

  const resources: Record<string, any> = {};
  for (const def of resourceDefs) {
    const resource = await prisma.resource.upsert({
      where: { employeeId: def.employeeId },
      create: {
        employeeId: def.employeeId,
        name: def.name,
        email: def.email,
        gender: def.gender ?? "UNDISCLOSED",
        country: def.country,
        workLocation: def.workLocation,
        location: def.location,
        willingToRelocate: def.willingToRelocate ?? false,
        costRate: def.costRate,
        currency: "USD",
        portfolioId: def.portfolioId,
        managerName: def.managerName,
        designation: def.designation,
        subCategory: def.subCategory,
        dateOfJoining: def.dateOfJoining ? new Date(def.dateOfJoining) : null,
        priorExperienceYears: def.priorExperienceYears ?? 0,
        status: "AVAILABLE",
        sourceSystem: "SEED",
      },
      update: {
        country: def.country,
        gender: def.gender ?? "UNDISCLOSED",
        workLocation: def.workLocation,
        location: def.location,
        managerName: def.managerName,
        designation: def.designation,
        subCategory: def.subCategory,
        dateOfJoining: def.dateOfJoining ? new Date(def.dateOfJoining) : null,
        priorExperienceYears: def.priorExperienceYears ?? 0,
        portfolioId: def.portfolioId,
        costRate: def.costRate,
      },
    });
    for (const [skillName, proficiency, years] of def.skillSet) {
      await prisma.resourceSkill.upsert({
        where: { resourceId_skillId: { resourceId: resource.id, skillId: skills[skillName] } },
        create: { resourceId: resource.id, skillId: skills[skillName], proficiency, yearsExperience: years },
        update: {},
      });
    }
    resources[def.employeeId] = resource;
  }

  // A couple of certifications
  await prisma.certification.createMany({
    data: [
      { resourceId: resources["E1004"].id, name: "AWS Certified Solutions Architect", issuer: "AWS", issueDate: new Date("2023-06-01") },
      { resourceId: resources["E1009"].id, name: "CKA - Certified Kubernetes Administrator", issuer: "CNCF", issueDate: new Date("2024-02-15") },
    ],
    skipDuplicates: true,
  });

  // Performance records (restricted visibility - HR/RMG/Delivery per FR-7.1/7.2)
  await prisma.performanceRecord.createMany({
    data: [
      { resourceId: resources["E1002"].id, rating: "Exceeds Expectations", pipStatus: false, reviewDate: new Date("2025-06-01") },
      { resourceId: resources["E1010"].id, rating: "Below Expectations", pipStatus: true, reviewDate: new Date("2025-05-01"), notes: "On a 60-day performance improvement plan." },
    ],
    skipDuplicates: true,
  });

  // ---------- Allocations (drive resource lifecycle states) ----------

  // Active allocations -> ALLOCATED
  await createAllocation(resources["E1001"].id, projects["FIN-P1"].id, tasksByProject["FIN-P1"].id, fin.id, 100, daysAgo(60), null, rmg.id, "ACTIVE", "Lead Engineer", "Venkat");
  await createAllocation(resources["E1002"].id, projects["FIN-P2"].id, tasksByProject["FIN-P2"].id, fin.id, 80, daysAgo(30), null, rmg.id, "ACTIVE", "Solution Architect", "Venkat");
  await createAllocation(resources["E1005"].id, projects["HC-P1"].id, tasksByProject["HC-P1"].id, health.id, 100, daysAgo(90), null, rmg2.id, "ACTIVE", "Delivery Manager", "Dhanasekar");
  await createAllocation(resources["E1008"].id, projects["PS-P1"].id, tasksByProject["PS-P1"].id, publicSector.id, 50, daysAgo(10), null, rmg2.id, "ACTIVE", "Change Manager", "Laxman");
  await createAllocation(resources["E1011"].id, projects["AIML-P1"].id, tasksByProject["AIML-P1"].id, aiMl.id, 100, daysAgo(45), null, rmg2.id, "ACTIVE", "ML Engineer", "Vamsi");
  await prisma.resource.updateMany({ where: { id: { in: [resources["E1001"].id, resources["E1002"].id, resources["E1005"].id, resources["E1008"].id] } }, data: { status: "ALLOCATED" } });
  await prisma.resource.update({ where: { id: resources["E1011"].id }, data: { status: "ALLOCATED", subCategory: "Internal Project" } });

  // Scheduled future allocation -> BENCH_COMMITTED
  await createAllocation(resources["E1003"].id, projects["FIN-P2"].id, tasksByProject["FIN-P2"].id, fin.id, 100, new Date(now + 7 * 24 * 60 * 60 * 1000), null, rmg.id, "SCHEDULED", "Data Scientist", "Venkat");
  await prisma.resource.update({ where: { id: resources["E1003"].id }, data: { status: "BENCH_COMMITTED", benchSince: daysAgo(3) } });

  // True bench, aged past threshold (35 days) -> should trigger aging alert
  await prisma.resource.update({ where: { id: resources["E1007"].id }, data: { status: "BENCH_TRUE", benchSince: daysAgo(35) } });

  // True bench, recently benched (5 days) -> should NOT trigger aging alert yet
  await prisma.resource.update({ where: { id: resources["E1011"].id }, data: { status: "BENCH_TRUE", benchSince: daysAgo(5) } });

  // A past closed allocation to give E1006 some history, now back to Available
  await createAllocation(resources["E1006"].id, projects["HC-P1"].id, tasksByProject["HC-P1"].id, health.id, 100, daysAgo(120), daysAgo(40), rmg2.id, "CLOSED", "Full Stack Engineer", "Adharsh");

  await prisma.maternityLeaveRequest.create({
    data: {
      resourceId: resources["E1009"].id,
      initiatedById: hr.id,
      status: "APPROVED",
      hrApproverId: hr.id,
      decidedAt: daysAgo(2),
      reason: "Approved maternity leave case for demo",
    },
  });
  await prisma.resource.update({ where: { id: resources["E1009"].id }, data: { status: "ON_ML", subCategory: "ML" } });

  // ---------- Demo demand records (show in Demand + Forecast screens) ----------
  const demandSeed = [
    {
      portfolioId: fin.id,
      projectName: "Core Banking Modernization",
      projectCode: "FIN-P1",
      clientName: "Nordic Bank",
      roleName: "Senior React Engineer",
      location: "Remote / Hyderabad",
      requiredSkills: ["React", "Node.js"],
      minProficiency: 4,
      minExperienceYears: 5,
      requiredCertifications: ["AWS Certified Solutions Architect"],
      requiredFte: 2.5,
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
      status: "PIPELINE",
      confidenceStage: "PIPELINE",
      ownerId: rmg.id,
      createdById: rmg.id,
      updatedById: rmg.id,
      notes: "Pending client confirmation and budget sign-off.",
    },
    {
      portfolioId: health.id,
      projectName: "Patient Portal Revamp",
      projectCode: "HC-P1",
      clientName: "CarePoint Health",
      roleName: "Java Engineer",
      location: "Bengaluru",
      requiredSkills: ["Java", "SQL"],
      minProficiency: 4,
      minExperienceYears: 4,
      requiredCertifications: [],
      requiredFte: 1.5,
      startDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      status: "COMMITTED",
      confidenceStage: "COMMITTED",
      ownerId: rmg2.id,
      createdById: rmg2.id,
      updatedById: rmg2.id,
      notes: "Committed with a start window in the next two to three weeks.",
    },
    {
      portfolioId: publicSector.id,
      projectName: "Citizen Services Portal",
      projectCode: "PS-P1",
      clientName: "City Digital Services",
      roleName: "Change Manager",
      location: "Hyderabad",
      requiredSkills: ["Change Management", "Project Management"],
      minProficiency: 3,
      minExperienceYears: 3,
      requiredCertifications: [],
      requiredFte: 1,
      startDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      status: "DRAFT",
      confidenceStage: "DRAFT",
      ownerId: rmg2.id,
      createdById: rmg2.id,
      updatedById: rmg2.id,
      notes: "Initial internal demand with partner review pending.",
    },
    {
      portfolioId: fin.id,
      projectName: "Digital Lending Platform",
      projectCode: "FIN-P3",
      clientName: "Apex Finance",
      roleName: "React Frontend Engineer",
      location: "Bengaluru",
      requiredSkills: ["React", "Node.js", "SQL"],
      minProficiency: 4,
      minExperienceYears: 4,
      requiredCertifications: ["AWS Certified Cloud Practitioner"],
      requiredFte: 2,
      startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 210 * 24 * 60 * 60 * 1000),
      status: "PIPELINE",
      confidenceStage: "PIPELINE",
      ownerId: rmg.id,
      createdById: rmg.id,
      updatedById: rmg.id,
      notes: "Client shortlist in progress for Bengaluru-based candidates.",
    },
    {
      portfolioId: aiMl.id,
      projectName: "AI Knowledge Assistant",
      projectCode: "AIML-P1",
      clientName: "Internal Innovation",
      roleName: "ML Engineer",
      location: "Hyderabad",
      requiredSkills: ["Python", "Data Science", "AWS"],
      minProficiency: 4,
      minExperienceYears: 5,
      requiredCertifications: [],
      requiredFte: 1.5,
      startDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      endDate: new Date(Date.now() + 170 * 24 * 60 * 60 * 1000),
      status: "COMMITTED",
      confidenceStage: "COMMITTED",
      ownerId: rmg2.id,
      createdById: rmg2.id,
      updatedById: rmg2.id,
      notes: "Internal project requirement focused on Python and ML pipeline work.",
    },
  ];

  for (const item of demandSeed) {
    await prisma.demandRequest.create({
      data: {
        ...item,
        requiredFte: new Prisma.Decimal(item.requiredFte.toString()),
      },
    });
  }

  // Remaining resources (E1004, E1009, E1010, E1012) stay AVAILABLE (already default).

  console.log("Seed complete.");
  console.log(`Demo login password for all seeded users: ${DEMO_PASSWORD}`);
  console.log("Users: admin@ram.com (ADMIN), rmg@ram.com / rmg2@ram.com (RMG), delivery.fin@ram.com / delivery.health@ram.com (DELIVERY),");
  console.log("       hr@ram.com (HR), ta@ram.com (TA), viewer@ram.com (VIEWER)");
}

async function createAllocation(
  resourceId: string,
  projectId: string,
  taskId: string,
  portfolioId: string,
  allocationPercent: number,
  startDate: Date,
  endDate: Date | null,
  createdById: string,
  status: "ACTIVE" | "SCHEDULED" | "CLOSED",
  roleOnProject?: string,
  projectReportingManagerName?: string
) {
  return prisma.allocation.create({
    data: {
      resourceId,
      projectId,
      taskId,
      portfolioId,
      allocationPercent,
      startDate,
      endDate,
      createdById,
      status,
      roleOnProject,
      projectReportingManagerName,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
