import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { UpdateDraftSchema } from "@/lib/validation/schemas";
import { requireUser, assertDraftAccess, AuthError } from "@/lib/auth/authorization";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if draft belongs to another user
    await assertDraftAccess(id, userId);

    const body = await req.json();
    const validated = UpdateDraftSchema.safeParse(body);
    if (!validated.success) {
      return NextResponse.json(
        { success: false, error: validated.error.issues[0].message },
        { status: 400 }
      );
    }

    const updated = await prisma.emailDraft.update({
      where: { id },
      data: {
        subject: validated.data.subject,
        body: validated.data.body,
        recipientEmail: validated.data.recipientEmail,
        companyName: validated.data.companyName,
        jobTitle: validated.data.jobTitle,
        reviewStatus: Object.keys(validated.data).some(key => key !== "reviewStatus")
          ? "NEEDS_REVIEW" : validated.data.reviewStatus,
      },
    });

    return NextResponse.json({ success: true, draft: updated });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = requireUser(req);
    const { id } = await params;

    // Verify ownership: throws 403 if draft belongs to another user
    await assertDraftAccess(id, userId);

    await prisma.emailDraft.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: "Draft deleted" });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}
