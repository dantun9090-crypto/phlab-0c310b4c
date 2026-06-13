/**
 * Server-fn wrapper for the post-purchase source survey. Implementation
 * (Firebase Admin access) lives in `source-survey.server.ts`.
 */
import { createServerFn } from "@tanstack/react-start";
import {
  submitSurveySchema,
  skipSurveySchema,
  type SubmitSurveyResult,
} from "./source-survey.server";

export type { SubmitSurveyResult } from "./source-survey.server";

export const submitSourceSurvey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => submitSurveySchema.parse(input))
  .handler(async ({ data }): Promise<SubmitSurveyResult> => {
    const { runSubmitSurvey } = await import("./source-survey.server");
    return runSubmitSurvey(data);
  });

export const skipSourceSurvey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => skipSurveySchema.parse(input))
  .handler(async ({ data }) => {
    const { runSkipSurvey } = await import("./source-survey.server");
    return runSkipSurvey(data);
  });
