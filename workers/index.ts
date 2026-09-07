/**
 * Фоновые воркеры ProfiBux.
 *
 * Деньги и статусы — только через src/server/modules/*.
 * Здесь расписание и логи. Запуск: npm run workers
 */

import {
  autoApproveTrusted,
  cleanupNotifications,
  dispatchOutbox,
  expireStaleSubmissions,
  monitorSla,
  reconcileLedger,
  releaseDueHolds,
  releaseReviewLocks,
  rollupStats,
} from "../src/server/modules/jobs";

const TASKS: { name: string; intervalMs: number; run: () => Promise<number | string[]> }[] = [
  { name: "hold-release", intervalMs: 60_000, run: releaseDueHolds },
  { name: "expire-submissions", intervalMs: 300_000, run: expireStaleSubmissions },
  { name: "release-review-locks", intervalMs: 300_000, run: releaseReviewLocks },
  { name: "auto-approve", intervalMs: 60_000, run: autoApproveTrusted },
  { name: "outbox-dispatch", intervalMs: 10_000, run: dispatchOutbox },
  { name: "stats-rollup", intervalMs: 900_000, run: rollupStats },
  { name: "sla-monitor", intervalMs: 600_000, run: monitorSla },
  { name: "ledger-reconcile", intervalMs: 3_600_000, run: reconcileLedger },
  { name: "notifications-cleanup", intervalMs: 86_400_000, run: cleanupNotifications },
];

async function main() {
  const once = process.argv.includes("--once");
  console.log(
    once
      ? "Воркеры ProfiBux: одиночный прогон"
      : "Воркеры ProfiBux запущены. Ctrl+C для остановки.",
  );

  const runTask = async (task: (typeof TASKS)[number]) => {
    try {
      const result = await task.run();
      if (task.name === "ledger-reconcile" && Array.isArray(result)) {
        if (result.length > 0) {
          console.error("[reconcile] РАСХОЖДЕНИЕ БАЛАНСА:");
          for (const problem of result) console.error(`  ${problem}`);
        } else {
          console.log("[reconcile] расхождений нет");
        }
        return;
      }
      if (task.name === "sla-monitor" && typeof result === "number" && result > 0) {
        console.warn(
          `[sla] ${result} выполнений превысили заявленное время одобрения`,
        );
      }
    } catch (error) {
      console.error(`[${task.name}] ошибка:`, error);
    }
  };

  for (const task of TASKS) await runTask(task);
  if (once) return;

  for (const task of TASKS) {
    setInterval(() => void runTask(task), task.intervalMs);
  }
}

void main();

process.once("SIGINT", () => process.exit(0));
process.once("SIGTERM", () => process.exit(0));
