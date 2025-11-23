const db = require('../db');
const axios = require('axios');

// URL do serviço de catálogo
const CATALOG_URL = 'http://localhost:4002/books';

const reservasController = {

    // --- CREATE (Já estava funcionando, mantivemos igual) ---
    createReservation: async (req, res) => {
        const { idLivro } = req.body;
        const idUsuarioFinal = req.userId; 

        if (!idLivro) return res.status(400).json({ message: "ID do livro é obrigatório." });
        if (!idUsuarioFinal) return res.status(401).json({ message: "Usuário não identificado." });

        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Busca Estoque (API)
            let totalFisico = 0;
            try {
                const response = await axios.get(`${CATALOG_URL}/${idLivro}`);
                totalFisico = response.data.estoque || 0;
            } catch (error) {
                await connection.rollback();
                return res.status(404).json({ message: "Livro não encontrado no catálogo." });
            }

            // 2. Conta Reservas (Local)
            const [reservasRes] = await connection.query(`
                SELECT COUNT(*) as total 
                FROM reserva 
                WHERE idLivro = ? AND statusReserva = 'Ativa'
            `, [idLivro]);

            const totalReservados = reservasRes[0].total || 0;
            const disponiveis = totalFisico - totalReservados;

            if (disponiveis > 0) {
                const prazo = new Date();
                prazo.setDate(prazo.getDate() + 3);

                const [resReserva] = await connection.query(
                    `INSERT INTO reserva (dataSolicitacao, prazoEmprestimo, statusReserva, idUsuario, idLivro)
                     VALUES (NOW(), ?, 'Ativa', ?, ?)`,
                    [prazo, idUsuarioFinal, idLivro]
                );

                await connection.commit();
                return res.status(201).json({ 
                    message: "Reserva realizada com sucesso!", 
                    type: "RESERVA",
                    id: resReserva.insertId
                });

            } else {
                // Lista de Espera
                const [checkLista] = await connection.query(
                    'SELECT * FROM listaespera WHERE idLivro = ? AND idUsuario = ? AND statusFila = "Aguardando"',
                    [idLivro, idUsuarioFinal]
                );

                if (checkLista.length > 0) {
                    await connection.rollback();
                    return res.status(409).json({ message: "Você já está na lista de espera." });
                }

                const [resLista] = await connection.query(
                    `INSERT INTO listaespera (dataEntradaFila, statusFila, idUsuario, idLivro)
                     VALUES (NOW(), 'Aguardando', ?, ?)`,
                    [idUsuarioFinal, idLivro]
                );

                await connection.commit();
                return res.status(201).json({ 
                    message: "Livro indisponível. Entrou na Lista de Espera.", 
                    type: "ESPERA",
                    id: resLista.insertId
                });
            }

        } catch (error) {
            await connection.rollback();
            console.error("Erro Create:", error.message);
            res.status(500).json({ error: error.message });
        } finally {
            connection.release();
        }
    },

    // --- READ: Minhas Reservas (CORRIGIDO) ---
    getMyReservations: async (req, res) => {
        const idUsuario = req.userId;
        try {
            // CORREÇÃO: idUsuario (não usuario_id) e dataSolicitacao (não dataReserva)
            const [reservas] = await db.query(`
                SELECT * FROM reserva WHERE idUsuario = ? ORDER BY dataSolicitacao DESC
            `, [idUsuario]);

            const reservasComTitulo = await Promise.all(reservas.map(async (r) => {
                try {
                    const bookResp = await axios.get(`${CATALOG_URL}/${r.idLivro}`);
                    return { 
                        idReserva: r.idReserva,
                        dataReserva: r.dataSolicitacao, // Mapeia para o nome que o front espera
                        prazoReserva: r.prazoEmprestimo,
                        statusReserva: r.statusReserva,
                        titulo: bookResp.data.titulo, 
                        editora: bookResp.data.editora 
                    };
                } catch (e) {
                    return { ...r, titulo: 'Livro não encontrado', editora: '-' };
                }
            }));

            res.json(reservasComTitulo);
        } catch (error) {
            console.error("Erro MyReservations:", error.message);
            res.status(500).json({ error: error.message });
        }
    },

    // --- READ: Todas / Admin (CORRIGIDO) ---
  getAllReservations: async (req, res) => {
        try {
            const [reservas] = await db.query(`SELECT * FROM reserva ORDER BY dataSolicitacao DESC`);

            const reservasCompletas = await Promise.all(reservas.map(async (r) => {
                try {
                    // Busca título do livro
                    const bookResp = await axios.get(`${CATALOG_URL}/${r.idLivro}`);
                    return { 
                        idReserva: r.idReserva,
                        usuario_nome: `User #${r.idUsuario}`, // Placeholder
                        titulo: bookResp.data.titulo,
                        dataReserva: r.dataSolicitacao,
                        prazoReserva: r.prazoEmprestimo, 
                        statusReserva: r.statusReserva
                    };
                } catch (e) {
                    return { 
                        ...r, 
                        titulo: 'Desconhecido', 
                        usuario_nome: `User #${r.idUsuario}`,
                        dataReserva: r.dataSolicitacao,
                        prazoReserva: r.prazoEmprestimo
                    };
                }
            }));

            res.json(reservasCompletas);
        } catch (error) {
            console.error("Erro AllReservations:", error.message);
            res.status(500).json({ error: error.message });
        }
    },

    // --- GET BY ID ---
    getReservationById: async (req, res) => {
        const { id } = req.params;
        try {
            const [rows] = await db.query('SELECT * FROM reserva WHERE idReserva = ?', [id]);
            if (rows.length === 0) return res.status(404).json({ message: "Não encontrada" });
            res.json(rows[0]);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // --- UPDATE ---
    updateReservation: async (req, res) => {
        const { id } = req.params;
        const { statusReserva } = req.body;
        try {
            await db.query('UPDATE reserva SET statusReserva = ? WHERE idReserva = ?', [statusReserva, id]);
            res.json({ message: "Atualizado" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    },

    // --- DELETE ---
    deleteReservation: async (req, res) => {
        const { id } = req.params;
        try {
            await db.query("UPDATE reserva SET statusReserva = 'Cancelada' WHERE idReserva = ?", [id]);
            res.json({ message: "Cancelada" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
};

module.exports = reservasController;