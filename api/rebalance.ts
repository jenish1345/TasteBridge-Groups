import { rebalanceHandler } from '../src/server/handlers.js';
import { toVercel } from '../src/server/vercel.js';

export default toVercel(rebalanceHandler, { limit: true });
