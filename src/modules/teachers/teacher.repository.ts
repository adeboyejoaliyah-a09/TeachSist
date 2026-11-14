import type { PrismaClient } from "@prisma/client";

export interface TeacherProfile {
  id: string;
  role: "teacher" | "school_admin";
  plan: string;
  school_id: string | null;
}

export interface TeacherRepository {
  getOrCreateProfile(id: string): Promise<TeacherProfile>;
}

export class PrismaTeacherRepository implements TeacherRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrCreateProfile(id: string): Promise<TeacherProfile> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT set_config('app.teacher_id', ${id}, true)`;
      const teacher = await transaction.teacher.upsert({
        where: { id },
        create: { id },
        update: {},
        select: { id: true, role: true, plan: true, schoolId: true },
      });
      return {
        id: teacher.id,
        role: teacher.role,
        plan: teacher.plan,
        school_id: teacher.schoolId,
      };
    });
  }
}
