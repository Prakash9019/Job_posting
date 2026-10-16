import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser, AuthError } from "@/lib/auth/authorization";

export async function GET(req: NextRequest) {
  try {
    const { userId } = requireUser(req);

    const attempts = await prisma.sendAttempt.findMany({
      where: { userId },
      include: {
        draft: {
          select: {
            id: true,
            companyName: true,
            jobTitle: true,
            subject: true,
            body: true,
            resume: {
              select: { fileName: true },
            },
          },
        },
        user: {
          select: { name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, attempts });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? body.ids
      : req.nextUrl.searchParams.get("id")
      ? [req.nextUrl.searchParams.get("id")!]
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "No history IDs provided for deletion" },
        { status: 400 }
      );
    }

    // Permanently hard delete send attempts owned by user
    const result = await prisma.sendAttempt.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Permanently deleted ${result.count} history record${result.count === 1 ? "" : "s"}`,
      count: result.count,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.statusCode });
    }
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

