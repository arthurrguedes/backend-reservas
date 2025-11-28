const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = (req, res, next) => {
    // Pega o token do header Bearer token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Acesso negado! Token não fornecido." });
    }

    try {
        // Verifica se o token é válido usando a chave
        const secret = process.env.JWT_SECRET;
        const decoded = jwt.verify(token, secret);

        // Salva o ID do usuário na requisição para usar nos controllers
        req.userId = decoded.id;

        next();
    } catch (error) {
        res.status(403).json({ message: "Token inválido ou expirado." });
    }
};