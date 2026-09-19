/**
 * Server message catalog.
 * Fixed spoken reply fragments, kept out of the composition root so wording is
 * single-sourced.
 */
export const SERVER_SPEECH = {
  supersededReport: "A new report was started. Please repeat your request.",
  voiceAccessUnavailable: "Voice access is unavailable.",
  sessionLimitReached:
    "I've reached my limit for this session — please try again in a little while.",
  turnNotSaved:
    "I could not save this conversation turn, so I cannot continue that request.",
  checkUnavailable:
    "I could not check that request right now. Please try again.",
} as const;
