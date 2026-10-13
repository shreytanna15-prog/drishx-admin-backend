import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import {
  attachPurchaseBillDocument,
  getPurchaseBillDocumentRef,
} from "@/app/lib/purchase-bill-documents";
import {
  MAX_PROCUREMENT_DOC_BYTES,
  ProcurementDocumentError,
} from "@/app/lib/procurement-documents";
import {
  signProcurementDocumentUrl,
  supabaseProcurementStorage,
} from "@/app/lib/procurement-storage";

type Ctx = { params: Promise<{ id: string }> };

function errorResponse(error: unknown, route: string) {
  if (error instanceof ProcurementDocumentError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error(`${route} error:`, error);
  return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
}

/** GET — short-lived signed URL for the bill document. ADMIN | EMPLOYEE (same as bills list). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  if (auth.session.role !== "ADMIN" && auth.session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    const ref = await getPurchaseBillDocumentRef(id);
    const url = await signProcurementDocumentUrl(ref.objectPath, ref.fileName);
    return NextResponse.json(
      { url, fileName: ref.fileName, expiresInSeconds: 300 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorResponse(error, "GET /api/finance/purchases/[id]/document");
  }
}

/** POST multipart (file) — attach/replace the supplier bill PDF/image. ADMIN only. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  try {
    const { id } = await ctx.params;
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Choose a PDF or image of the bill." }, { status: 400 });
    }
    if (file.size > MAX_PROCUREMENT_DOC_BYTES) {
      return NextResponse.json({ error: "File is larger than 12 MB." }, { status: 400 });
    }
    const bill = await attachPurchaseBillDocument({
      purchaseBillId: id,
      file: { buffer: new Uint8Array(await file.arrayBuffer()), fileName: file.name || null },
      storage: supabaseProcurementStorage,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ bill });
  } catch (error) {
    return errorResponse(error, "POST /api/finance/purchases/[id]/document");
  }
}
