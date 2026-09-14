/**
 * Backward-compatible DiscourseConnect entrypoint.
 *
 * Older Discourse configuration points to /api/sso. Keep that URL working
 * while installations migrate to the explicit /api/auth/discourse-sso path.
 */
export { GET } from "@/server/api/auth/discourse-sso/route";
