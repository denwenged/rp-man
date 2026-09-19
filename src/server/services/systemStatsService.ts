import os from 'os';
import si from 'systeminformation';
import { db } from '../db';
import { SystemStats } from '../../shared/types';
import { ollamaService } from './ollamaService';
import { queueService } from './queueService';

let lastCpuUsage = { time: Date.now(), user: 0, sys: 0, idle: 0 };

function getCpuUsage(): number {
  const cpus = os.cpus();
  let totalUser = 0;
  let totalSys = 0;
  let totalIdle = 0;

  for (const cpu of cpus) {
    totalUser += cpu.times.user + cpu.times.nice;
    totalSys += cpu.times.sys + cpu.times.irq;
    totalIdle += cpu.times.idle;
  }

  const now = Date.now();
  const timeDiff = now - lastCpuUsage.time;
  if (timeDiff < 500) {
    // Return rough load avg scaled to cpus
    const load = os.loadavg()[0];
    return Math.min(100, Math.round((load / Math.max(1, cpus.length)) * 100));
  }

  const userDiff = totalUser - lastCpuUsage.user;
  const sysDiff = totalSys - lastCpuUsage.sys;
  const idleDiff = totalIdle - lastCpuUsage.idle;
  const totalDiff = userDiff + sysDiff + idleDiff;

  lastCpuUsage = {
    time: now,
    user: totalUser,
    sys: totalSys,
    idle: totalIdle
  };

  if (totalDiff <= 0) return 0;
  const usage = Math.round(((userDiff + sysDiff) / totalDiff) * 100);
  return Math.min(100, Math.max(0, usage));
}

export async function getSystemStats(): Promise<SystemStats> {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const ramPercent = Math.round((usedMem / totalMem) * 100);

  let diskUsed = 0;
  let diskTotal = 0;
  let diskPercent = 0;
  let swapUsed = 0;
  let swapTotal = 0;

  try {
    const fsSize = await si.fsSize();
    if (fsSize && fsSize.length > 0) {
      const rootFs = fsSize.find(f => f.mount === '/' || f.mount === '/app') || fsSize[0];
      diskUsed = rootFs.used;
      diskTotal = rootFs.size;
      diskPercent = Math.round(rootFs.use);
    }
  } catch (e) {
    // fallback default estimates
    diskTotal = 100 * 1024 * 1024 * 1024;
    diskUsed = 20 * 1024 * 1024 * 1024;
    diskPercent = 20;
  }

  try {
    const memInfo = await si.mem();
    swapUsed = memInfo.swapused || 0;
    swapTotal = memInfo.swaptotal || 0;
  } catch (e) {
    swapUsed = 0;
    swapTotal = 0;
  }

  // Ollama status
  let ollamaStatus: 'online' | 'offline' | 'error' = 'offline';
  let runningModelsCount = 0;

  try {
    const running = await ollamaService.getRunningModels();
    ollamaStatus = 'online';
    runningModelsCount = running.length;
  } catch (e) {
    ollamaStatus = 'offline';
  }

  const procMem = process.memoryUsage();

  return {
    cpu_percent: getCpuUsage(),
    ram_used_bytes: usedMem,
    ram_total_bytes: totalMem,
    ram_free_bytes: freeMem,
    ram_percent: ramPercent,
    swap_used_bytes: swapUsed,
    swap_total_bytes: swapTotal,
    disk_used_bytes: diskUsed,
    disk_total_bytes: diskTotal,
    disk_percent: diskPercent,
    process_memory_bytes: procMem.rss,
    uptime_seconds: Math.round(process.uptime()),
    ollama_status: ollamaStatus,
    ollama_running_models_count: runningModelsCount,
    active_llm_requests: queueService.getActiveCount(),
    queue_length: queueService.getQueueLength()
  };
}
