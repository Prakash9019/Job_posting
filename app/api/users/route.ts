import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getSessionFromRequest } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const session = getSessionFromRequest(req);

    // Ensure User A and User B exist
    await prisma.user.upsert({
      where: { id: "user_a" },
      update: {},
      create: { id: "user_a", name: "User A" },
    });
    await prisma.user.upsert({
      where: { id: "user_b" },
      update: {},
      create: { id: "user_b", name: "User B" },
    });

    const users = await prisma.user.findMany({
      include: {
        gmailAccounts: {
          // Strictly isolate Gmail account info: only return for the authenticated session user
          where: session ? { userId: session.userId } : { id: "__none__" },
          select: {
            id: true,
            email: true,
            isConnected: true,
            lastSyncedAt: true,
            createdAt: true,
          },
        },
        resumes: {
          where: session ? { userId: session.userId, isActive: true } : { id: "__none__" },
          take: 1,
        },
      },
      orderBy: { id: "asc" },
    });

    return NextResponse.json({ success: true, users });
  } catch (error: unknown) {
    console.error("Error fetching users:", error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500 }
    );
  }
}
