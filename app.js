// app.js (in backend root folder)
import express from 'express';
import authRoutes from './src/routes/auth.routes.js';  // ← FIXED: Added src/

const app = express();

app.use(express.json());
app.use('/api/auth', authRoutes);

app.get('/', (req, res) => {
    res.json({ message: "Welcome to the API! 🎵" });
});

export default app;