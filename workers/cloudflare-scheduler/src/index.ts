interface SchedulerEnv {
  STAFF_ORIGIN: string;
  CRON_SECRET: string;
}

type SchedulerController = { cron: string; scheduledTime: number };
type SchedulerExecutionContext = { waitUntil(promise: Promise<unknown>): void };
type SchedulerHandler = {
  scheduled(controller: SchedulerController, env: SchedulerEnv, context: SchedulerExecutionContext): void;
};

const FIVE_MINUTE_JOBS = [
  "/api/cron/integration-outbox",
  "/api/cron/lead-sla-check",
] as const;

const HOURLY_JOBS = [
  "/api/cron/payment-reminders",
  "/api/cron/privacy-retention",
  "/api/cron/richmenu-scheduler",
] as const;

async function runJob(path: string, env: SchedulerEnv) {
  const response = await fetch(new URL(path, env.STAFF_ORIGIN), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${env.CRON_SECRET}`,
    },
  });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return { path, status: response.status };
}

export default {
  async scheduled(controller: SchedulerController, env: SchedulerEnv, context: SchedulerExecutionContext) {
    const jobs: readonly string[] = new Date().getUTCMinutes() === 0
      ? [...FIVE_MINUTE_JOBS, ...HOURLY_JOBS]
      : FIVE_MINUTE_JOBS;
    context.waitUntil((async () => {
      const results = await Promise.allSettled(jobs.map((path) => runJob(path, env)));
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      if (failures.length > 0) {
        console.error("SolarDream scheduled jobs failed", failures.map((failure) => String(failure.reason)));
        throw new Error(`${failures.length} scheduled job(s) failed.`);
      }
      console.log("SolarDream scheduled jobs completed", results.map((result) => result.status === "fulfilled" ? result.value : result));
    })());
  },
} satisfies SchedulerHandler;
