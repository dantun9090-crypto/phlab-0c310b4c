import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  idToken: z.string().min(10).max(4096),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  slot: z.enum(["body-bg", "header-bg", "hero-bg", "logo"]),
  base64: z.string().min(10).max(8_000_000),
});

export const uploadEmailBrandingImage = createServerFn({ method: "POST" })
  .validator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    const { requireFirebaseAdmin } = await import("@/lib/server/firebase-auth-admin");
    await requireFirebaseAdmin(data.idToken);

    const { uploadEmailBrandingImageAdmin } = await import("@/lib/server/firebase-storage-admin");
    return uploadEmailBrandingImageAdmin({
      base64: data.base64,
      contentType: data.contentType,
      slot: data.slot,
    });
  });
