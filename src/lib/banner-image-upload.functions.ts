import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().min(10).max(8_000_000),
});

export const uploadBannerImage = createServerFn({ method: "POST" })
  .validator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
    await requireFirebaseAdmin(data.idToken);

    const { uploadBannerImageAdmin } = await import("@/lib/server/firebase-storage-admin");
    return uploadBannerImageAdmin({
      base64: data.base64,
      contentType: data.contentType,
    });
  });
