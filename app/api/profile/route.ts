import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, AuthError } from "@/lib/auth/authorization";

const ProfileSchema = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[^\r\n<>]+$/, "Enter a valid name").optional(),
  email: z.string().trim().email().optional(),
  noticePeriod: z.string().optional(),
  expectedCTC: z.number().nullable().optional(),
  currentCTC: z.number().nullable().optional(),
  availabilityDate: z.string().datetime().nullable().optional(),
  relocationPreferences: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const { userId } = requireUser(req);
    const body = await req.json();
    const parsed = ProfileSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.issues[0].message }, { status: 400 });

    if (parsed.data.email) {
      const account = await prisma.gmailAccount.findFirst({
        where: { userId, email: parsed.data.email, isConnected: true },
      });
      if (!account) return NextResponse.json({ success: false, error: "Connect this Gmail address first, then save it as your From address." }, { status: 400 });
    }
    
    await prisma.user.update({ where: { id: userId }, data: parsed.data });
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Unable to save profile" }, { status: error instanceof AuthError ? error.statusCode : 500 });
  }
}
