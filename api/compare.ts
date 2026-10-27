import { compare } from '../src/server/handlers.js';
import { toVercel } from '../src/server/vercel.js';

export default toVercel(compare, { limit: true });
