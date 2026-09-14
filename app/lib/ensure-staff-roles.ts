import { prisma } from "./prisma";
import { SYSTEM_STAFF_ROLE_SEEDS } from "./staff-permissions";

export async function ensureSystemStaffRoles() {
  const now = new Date();
  for (const seed of SYSTEM_STAFF_ROLE_SEEDS) {
    await prisma.staffRole.upsert({
      where: { slug: seed.slug },
      create: {
        slug: seed.slug,
        name: seed.name,
        description: seed.description,
        isSystem: true,
        permissions: seed.permissions,
        updatedAt: now,
      },
      update: {
        name: seed.name,
        description: seed.description,
        isSystem: true,
        permissions: seed.permissions,
      },
    });
  }
}

export async function getFullOperationsRole() {
  await ensureSystemStaffRoles();
  return prisma.staffRole.findUnique({
    where: { slug: "full-operations" },
  });
}
