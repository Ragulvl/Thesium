// Why: Bull Board dashboard for queue monitoring — see failed/stuck jobs, queue health, job details.
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { generationQueue } from '../services/queue.js';

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [new BullMQAdapter(generationQueue)],
  serverAdapter,
});

export { serverAdapter };
