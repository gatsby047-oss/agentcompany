import { MembershipRole, MembershipStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { forbidden, notFound } from "@/lib/http";

const defaultAllowedRoles: MembershipRole[] = [MembershipRole.ADMIN, MembershipRole.MEMBER];

export async function ensureCompanyAccess(
  userId: string,
  companyId: string,
  allowedRoles: MembershipRole[] = defaultAllowedRoles
) {
  const membership = await prisma.membership.findFirst({
    where: {
      companyId,
      userId,
      status: MembershipStatus.ACTIVE,
      role: { in: allowedRoles }
    }
  });

  if (!membership) {
    throw forbidden("You do not have access to this company");
  }

  return membership;
}

export async function ensureCompanyAdmin(userId: string, companyId: string) {
  return ensureCompanyAccess(userId, companyId, [MembershipRole.ADMIN]);
}

export async function ensureProjectAccess(
  userId: string,
  projectId: string,
  allowedRoles: MembershipRole[] = defaultAllowedRoles
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId }
  });

  if (!project) {
    throw notFound("Project not found");
  }

  const membership = await ensureCompanyAccess(userId, project.companyId, allowedRoles);
  return { project, membership };
}

export async function ensureWorkflowAccess(
  userId: string,
  workflowId: string,
  allowedRoles: MembershipRole[] = defaultAllowedRoles
) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: {
      project: true
    }
  });

  if (!workflow) {
    throw notFound("Workflow not found");
  }

  const membership = await ensureCompanyAccess(userId, workflow.project.companyId, allowedRoles);
  return { workflow, membership, project: workflow.project };
}

export async function ensureTaskAccess(
  userId: string,
  taskRunId: string,
  allowedRoles: MembershipRole[] = defaultAllowedRoles
) {
  const taskRun = await prisma.taskRun.findUnique({
    where: { id: taskRunId },
    include: {
      project: true,
      workflowNode: true
    }
  });

  if (!taskRun) {
    throw notFound("Task run not found");
  }

  const membership = await ensureCompanyAccess(userId, taskRun.project.companyId, allowedRoles);
  return { taskRun, membership, project: taskRun.project, workflowNode: taskRun.workflowNode };
}
