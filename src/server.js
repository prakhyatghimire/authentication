import app from '../app.js';
import { prisma } from './config/db.js';

const PORT = process.env.PORT||3000;


app.listen(PORT, () => {
  console.log(` Server is running on http://localhost:${PORT}`);
  

  prisma.$connect()
    .then(() => console.log(' Connected to PostgreSQL Database'))
    .catch(err => console.error('Database connection failed:', err));
});
