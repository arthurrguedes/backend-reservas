const db = require('../db');
const axios = require('axios');

// URL do serviço de catálogo
const CATALOG_URL = 'http://localhost:4002/books';
// URL do serviço de empréstimos (Adicionado para verificação de disponibilidade real - Opcional mas recomendado)
// const LOANS_URL = 'http://localhost:4004/emprestimos'; 

const reservasController = {

    // --- CREATE (Mantido igual) ---
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

            // 2. Conta Reservas Ativas (Local)
            const [reservasRes] = await connection.query(`
                SELECT COUNT(*) as total 
                FROM reserva 
                WHERE idLivro = ? AND statusReserva = 'Ativa'
            `, [idLivro]);

            const totalReservados = reservasRes[0].total || 0;
            
            // NOTA: Idealmente, você deveria subtrair também os livros que estão EMPRESTADOS atualmente.
            // Disponibilidade = TotalFisico - ReservasAtivas - EmprestimosAtivos
            // Como o serviço de empréstimos é novo, mantive sua lógica atual, mas fique ciente que 
            // o sistema pode permitir reservar um livro que já está fisicamente com alguém se não houver essa verificação.
            
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

    // --- READ: Minhas Reservas ---
    getMyReservations: async (req, res) => {
        const idUsuario = req.userId;
        try {
            const [reservas] = await db.query(`
                SELECT * FROM reserva WHERE idUsuario = ? ORDER BY dataSolicitacao DESC
            `, [idUsuario]);

            const reservasComTitulo = await Promise.all(reservas.map(async (r) => {
                try {
                    const bookResp = await axios.get(`${CATALOG_URL}/${r.idLivro}`);
                    return { 
                        idReserva: r.idReserva,
                        dataReserva: r.dataSolicitacao,
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

    // --- READ: Todas / Admin ---
    getAllReservations: async (req, res) => {
        try {
            const [reservas] = await db.query(`SELECT * FROM reserva ORDER BY dataSolicitacao DESC`);

            const reservasCompletas = await Promise.all(reservas.map(async (r) => {
                try {
                    const bookResp = await axios.get(`${CATALOG_URL}/${r.idLivro}`);
                    return { 
                        idReserva: r.idReserva,
                        usuario_nome: `User #${r.idUsuario}`,
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

    // --- UPDATE (AJUSTADO PARA INTEGRAÇÃO COM EMPRÉSTIMOS) ---
    updateReservation: async (req, res) => {
        const { id } = req.params;
        // Agora extraímos também dataRetirada, que vem do backend-emprestimos
        const { statusReserva, dataRetirada } = req.body; 

        try {
            // Construção dinâmica da query para atualizar um ou ambos os campos
            let campos = [];
            let valores = [];

            if (statusReserva) {
                campos.push('statusReserva = ?');
                valores.push(statusReserva);
            }
            if (dataRetirada) {
                campos.push('dataRetirada = ?');
                valores.push(dataRetirada);
            }

            if (campos.length === 0) {
                return res.status(400).json({ message: "Nenhum dado fornecido para atualização." });
            }

            valores.push(id); // ID para o WHERE

            const query = `UPDATE reserva SET ${campos.join(', ')} WHERE idReserva = ?`;
            
            await db.query(query, valores);
            res.json({ message: "Reserva atualizada com sucesso." });
        } catch (error) {
            console.error("Erro Update Reservation:", error.message);
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