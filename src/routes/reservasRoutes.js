const express = require('express');
const router = express.Router();
const reservasController = require('../controllers/ReservasController');
const authMiddleware = require('../middlewares/auth'); 

// Criar (Reserva ou Lista de Espera)
router.post('/', authMiddleware, reservasController.createReservation);

// Ler (Listas)
router.get('/', authMiddleware, reservasController.getAllReservations); // Admin
router.get('/my', authMiddleware, reservasController.getMyReservations); // User logado (usa req.userId)
router.get('/user/:userId', authMiddleware, reservasController.getMyReservations); // Fallback

// Ler (Detalhe)
router.get('/:id', authMiddleware, reservasController.getReservationById);

// Atualizar (Admin estender prazo ou mudar status)
router.put('/:id', authMiddleware, reservasController.updateReservation);

// Deletar (Cancelar)
router.delete('/:id', authMiddleware, reservasController.deleteReservation);

module.exports = router;