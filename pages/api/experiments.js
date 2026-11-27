import { handler, load } from '../../lib/api.js';
import { experiments } from '../../lib/metrics.js';

export default handler(async (q) => { const { users } = await load({ ...q, experiment: '', variant: '' }); return { rows: experiments(users, { landing: String(q.landing || '') }), landing: String(q.landing || '') }; });
