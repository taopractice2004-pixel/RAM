import { Router } from "express";
import { prisma } from "../prisma";
import { portfolioReadWhere } from "../utils/scope";

const router = Router();

router.get("/", async (req, res) => {
  const { portfolioId } = req.query as Record<string, string | undefined>;
  const where: any = { ...portfolioReadWhere(req) };
  if (portfolioId) where.portfolioId = portfolioId;

  const projects = await prisma.project.findMany({
    where,
    include: { tasks: true, portfolio: true },
    orderBy: { name: "asc" },
  });
  res.json(projects);
});

export default router;
