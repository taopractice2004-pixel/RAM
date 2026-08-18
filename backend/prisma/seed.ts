import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Password123!";

async function main() {
  console.log("Seeding RAM database...");

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // ---------- Portfolios ----------
  const [fin, health, publicSector] = await Promise.all([
    prisma.portfolio.upsert({ where: { code: "FIN" }, create: { code: "FIN", name: "Financial Services" }, update: {} }),
    prisma.portfolio.upsert({ where: { code: "HC" }, create: { code: "HC", name: "Healthcare" }, update: {} }),
    prisma.portfolio.upsert({ where: { code: "PS" }, create: { code: "PS", name: "Public Sector" }, update: {} }),
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
    [rmg2.id, fin.id],
    [rmg2.id, health.id],
    [rmg2.id, publicSector.id],
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
  ];
  const projects: Record<string, any> = {};
  for (const p of projectDefs) {
    projects[p.code] = await prisma.project.upsert({
      where: { code: p.code },
      create: { ...p, status: "ACTIVE", startDate: new Date("2025-01-01") },
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
  }

  const resourceDefs: ResourceDef[] = [
    { employeeId: "E1001", name: "Alicia Chen", email: "alicia.chen@corp.com", location: "New York, US", portfolioId: fin.id, costRate: 145, skillSet: [["React", 5, 6], ["Node.js", 4, 5]] },
    { employeeId: "E1002", name: "Brian Walsh", email: "brian.walsh@corp.com", location: "Chicago, US", portfolioId: fin.id, costRate: 130, skillSet: [["Java", 5, 8], ["SQL", 4, 8]] },
    { employeeId: "E1003", name: "Carla Gomez", email: "carla.gomez@corp.com", location: "Austin, US", portfolioId: fin.id, costRate: 160, skillSet: [["Data Science", 5, 5], ["Python", 5, 6]], willingToRelocate: true },
    { employeeId: "E1004", name: "Devon Park", email: "devon.park@corp.com", location: "Remote", portfolioId: fin.id, costRate: 120, skillSet: [["AWS", 4, 4], ["DevOps", 4, 4]] },
    { employeeId: "E1005", name: "Elena Petrova", email: "elena.petrova@corp.com", location: "Boston, US", portfolioId: health.id, costRate: 150, skillSet: [["Project Management", 5, 10]] },
    { employeeId: "E1006", name: "Farid Haidari", email: "farid.haidari@corp.com", location: "Seattle, US", portfolioId: health.id, costRate: 135, skillSet: [["React", 4, 4], ["Node.js", 3, 3]] },
    { employeeId: "E1007", name: "Grace Lee", email: "grace.lee@corp.com", location: "San Francisco, US", portfolioId: health.id, costRate: 155, skillSet: [["Data Science", 4, 4], ["SQL", 4, 5]] },
    { employeeId: "E1008", name: "Hassan Ali", email: "hassan.ali@corp.com", location: "Remote", portfolioId: publicSector.id, costRate: 110, skillSet: [["Salesforce", 4, 3], ["Change Management", 3, 3]] },
    { employeeId: "E1009", name: "Ingrid Sorensen", email: "ingrid.sorensen@corp.com", location: "Denver, US", portfolioId: publicSector.id, costRate: 140, skillSet: [["Kubernetes", 4, 3], ["AWS", 3, 3]] },
    { employeeId: "E1010", name: "Jamal Robinson", email: "jamal.robinson@corp.com", location: "Atlanta, US", portfolioId: fin.id, costRate: 125, skillSet: [["Java", 3, 3], ["Project Management", 3, 2]] },
    { employeeId: "E1011", name: "Kavya Iyer", email: "kavya.iyer@corp.com", location: "Remote", portfolioId: health.id, costRate: 132, skillSet: [["Python", 4, 4], ["Data Science", 3, 3]] },
    { employeeId: "E1012", name: "Liam O'Connor", email: "liam.oconnor@corp.com", location: "Dublin, IE", portfolioId: publicSector.id, costRate: 118, skillSet: [["SQL", 3, 3], ["Salesforce", 3, 2]] },
  ];

  const resources: Record<string, any> = {};
  for (const def of resourceDefs) {
    const resource = await prisma.resource.upsert({
      where: { employeeId: def.employeeId },
      create: {
        employeeId: def.employeeId,
        name: def.name,
        email: def.email,
        location: def.location,
        willingToRelocate: def.willingToRelocate ?? false,
        costRate: def.costRate,
        currency: "USD",
        portfolioId: def.portfolioId,
        status: "AVAILABLE",
        sourceSystem: "SEED",
      },
      update: {},
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
  await createAllocation(resources["E1001"].id, projects["FIN-P1"].id, tasksByProject["FIN-P1"].id, fin.id, 100, daysAgo(60), null, rmg.id, "ACTIVE");
  await createAllocation(resources["E1002"].id, projects["FIN-P2"].id, tasksByProject["FIN-P2"].id, fin.id, 80, daysAgo(30), null, rmg.id, "ACTIVE");
  await createAllocation(resources["E1005"].id, projects["HC-P1"].id, tasksByProject["HC-P1"].id, health.id, 100, daysAgo(90), null, rmg2.id, "ACTIVE");
  await createAllocation(resources["E1008"].id, projects["PS-P1"].id, tasksByProject["PS-P1"].id, publicSector.id, 50, daysAgo(10), null, rmg2.id, "ACTIVE");
  await prisma.resource.updateMany({ where: { id: { in: [resources["E1001"].id, resources["E1002"].id, resources["E1005"].id, resources["E1008"].id] } }, data: { status: "ALLOCATED" } });

  // Scheduled future allocation -> BENCH_COMMITTED
  await createAllocation(resources["E1003"].id, projects["FIN-P2"].id, tasksByProject["FIN-P2"].id, fin.id, 100, new Date(now + 7 * 24 * 60 * 60 * 1000), null, rmg.id, "SCHEDULED");
  await prisma.resource.update({ where: { id: resources["E1003"].id }, data: { status: "BENCH_COMMITTED", benchSince: daysAgo(3) } });

  // True bench, aged past threshold (35 days) -> should trigger aging alert
  await prisma.resource.update({ where: { id: resources["E1007"].id }, data: { status: "BENCH_TRUE", benchSince: daysAgo(35) } });

  // True bench, recently benched (5 days) -> should NOT trigger aging alert yet
  await prisma.resource.update({ where: { id: resources["E1011"].id }, data: { status: "BENCH_TRUE", benchSince: daysAgo(5) } });

  // A past closed allocation to give E1006 some history, now back to Available
  await createAllocation(resources["E1006"].id, projects["HC-P1"].id, tasksByProject["HC-P1"].id, health.id, 100, daysAgo(120), daysAgo(40), rmg2.id, "CLOSED");

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
  status: "ACTIVE" | "SCHEDULED" | "CLOSED"
) {
  return prisma.allocation.create({
    data: { resourceId, projectId, taskId, portfolioId, allocationPercent, startDate, endDate, createdById, status },
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
