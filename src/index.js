const express = require('express');
const cors = require('cors');
require('dotenv').config();

const reservasRoutes = require('./routes/reservasRoutes');

const app = express();
const PORT = process.env.PORT || 4003;

app.use(cors());
app.use(express.json());

app.use('/reservas', reservasRoutes);

app.get('/', (req, res) => {
    res.send('API de Reservas rodando!');
});

app.listen(PORT, () => {
    console.log(`Servidor de Reservas rodando na porta ${PORT}`);
});