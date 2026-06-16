import { Queue } from 'bullmq';


// Note: BullMQ automatically manages queues securely on Redis
export const generationQueue = new Queue('generation-queue', { 
  connection: {
    host: new URL(process.env.REDIS_URL || 'redis://localhost:6379').hostname,
    port: parseInt(new URL(process.env.REDIS_URL || 'redis://localhost:6379').port || '6379', 10),
  } 
});
