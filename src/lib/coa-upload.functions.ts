import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  productId: z.string().min(1).max(140),
  filename: z.string().min(1).max(200).optional(),
  contentType: z.literal("application/pdf"),
  base64: z.string().min(10).max(15_000_000),
});

export const uploadCoaPdf = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
    await requireFirebaseAdmin(data.idToken);

    const { uploadCoaPdfAdmin } = await import("@/lib/server/firebase-storage-admin");
    return uploadCoaPdfAdmin({
      base64: data.base64,
      contentType: data.contentType,
      productId: data.productId,
      filename: data.filename,
    });
  });
