import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, assertResumeAccess, AuthError } from "@/lib/auth/authorization";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if resume does not belong to active user
    const resume = await assertResumeAccess(id, userId);

    // Set all other resumes for this user to inactive
    await prisma.resume.updateMany({
      where: { userId },
      data: { isActive: false },
    });

    const updated = await prisma.resume.update({
      where: { id: resume.id },
      data: { isActive: true },
    });

    return NextResponse.json({ success: true, resume: updated });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
