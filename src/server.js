import app from '../app.js';
import { pool } from './config/db.js';  //

const PORT = process.env.PORT||3000;


app.listen(PORT, () => {
  console.log(` Server is running on http://localhost:${PORT}`);
  

  pool.connect()
    .then(() => console.log(' Connected to PostgreSQL Database'))
    .catch(err => console.error('Database connection failed:', err));
});