const db = require('./src/db');

async function checkColumns() {
    try {
        console.log("--- Verificando tabela RESERVA ---");
        const [colsReserva] = await db.query("SHOW COLUMNS FROM reserva");
        colsReserva.forEach(c => console.log("Coluna:", c.Field));

        console.log("\n--- Verificando tabela LISTAESPERA ---");
        const [colsLista] = await db.query("SHOW COLUMNS FROM listaespera");
        colsLista.forEach(c => console.log("Coluna:", c.Field));

        process.exit();
    } catch (error) {
        console.error("Erro de conexão:", error.message);
    }
}

checkColumns();