import { performance } from 'node:perf_hooks';
import { onRequest } from 'firebase-functions/v2/https';
import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

let invocationCount = 0;
const moduleLoadedAt = Date.now();
console.log(`[bench:bff] stage=module_loaded ts=${moduleLoadedAt} pid=${process.pid}`);

export default onRequest(
  {
    region: 'us-central1',
    invoker: 'public',
    minInstances: 0,
    maxInstances: 1,
    concurrency: 1,
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  async (req, res) => {
    const runId = String(req.query.runId || `run-${Date.now()}`);
    invocationCount += 1;
    const coldLikely = invocationCount === 1;
    const functionName = process.env.K_SERVICE || process.env.FUNCTION_NAME || 'unknown';

    const handlerStart = performance.now();

    const adminInitStart = performance.now();
    const adminWasCold = getApps().length === 0;
    if (adminWasCold) {
      initializeApp();
    }
    const db = getFirestore();
    const adminInitMs = performance.now() - adminInitStart;
    console.log(
      `[bench:bff] runId=${runId} stage=admin_init ms=${adminInitMs.toFixed(3)} adminCold=${adminWasCold}`,
    );

    const docRef = db.collection('benchmark_runs').doc(`bff-${runId}`);

    const readStart = performance.now();
    const existing = await docRef.get();
    const firestoreReadMs = performance.now() - readStart;
    console.log(`[bench:bff] runId=${runId} stage=firestore_read ms=${firestoreReadMs.toFixed(3)}`);

    const writeStart = performance.now();
    await docRef.set(
      {
        runId,
        label: 'bff',
        functionName,
        invocationCount,
        coldLikely,
        previousExists: existing.exists,
        timestamp: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    const firestoreWriteMs = performance.now() - writeStart;
    console.log(`[bench:bff] runId=${runId} stage=firestore_write ms=${firestoreWriteMs.toFixed(3)}`);

    const handlerTotalMs = performance.now() - handlerStart;
    console.log(
      `[bench:bff] runId=${runId} stage=handler_total ms=${handlerTotalMs.toFixed(3)} coldLikely=${coldLikely} uptimeMs=${Math.round(process.uptime() * 1000)} invocations=${invocationCount}`,
    );

    res.status(200).json({
      runId,
      label: 'bff',
      functionName,
      pid: process.pid,
      invocationCount,
      coldLikely,
      processUptimeMs: Math.round(process.uptime() * 1000),
      moduleLoadedAt,
      timings: {
        adminInitMs,
        firestoreReadMs,
        firestoreWriteMs,
        handlerTotalMs,
      },
    });
  },
);
