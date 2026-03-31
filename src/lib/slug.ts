import slugify from "slugify";
import { prisma } from "@/lib/db";

export async function createUniqueCompanySlug(name: string) {
  const baseSlug =
    slugify(name, {
      lower: true,
      strict: true,
      trim: true
    }) || "company";

  let candidate = baseSlug;
  let suffix = 1;

  while (await prisma.company.findUnique({ where: { slug: candidate } })) {
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }

  return candidate;
}
