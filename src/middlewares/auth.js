module.exports = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ message: "Token não fornecido." });
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2) {
        return res.status(401).json({ message: "Erro no formato do token." });
    }
    
    const token = parts[1];

    try {
        const tokenParts = token.split('.');
        if (tokenParts.length !== 3) {
            throw new Error("Token malformado");
        }

        const base64Payload = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payloadStr = Buffer.from(base64Payload, 'base64').toString('utf-8');
        const payload = JSON.parse(payloadStr);

        if (!payload.id) {
            return res.status(403).json({ message: "Token inválido: ID do utilizador não encontrado." });
        }

        req.userId = payload.id;
        next();

    } catch (e) {
        console.error("Erro na autenticação:", e.message);
        return res.status(401).json({ message: "Token inválido ou expirado." });
    }
};