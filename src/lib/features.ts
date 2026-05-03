// Feature flags. Read-once at module load — flipping the env var requires
// a redeploy on Vercel. Used to gate routes (return 404 when off) and UI
// (hide nav links / disable buttons when off).
export function advisorEnabled(): boolean {
  return process.env.FEATURE_ADVISOR === 'true';
}
