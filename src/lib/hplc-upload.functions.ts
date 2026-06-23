import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  productId: z.string().min(1).max(140),
  variantIndex: z.number().int().min(0).max(99),
  contentType: z.string().min(3).max(80),
  base64: z.string().min(10).max(8_000_000),
});

export const uploadHplcImageAdmin = createServerFn({ method: "POST" })
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
    await requireFirebaseAdmin(data.idToken);

    const { uploadHplcStorageImage } = await import("@/lib/server/firebase-storage-admin");
    return uploadHplcStorageImage({
      base64: data.base64,
      contentType: data.contentType,
      productId: data.productId,
      variantIndex: data.variantIndex,
    });
  });