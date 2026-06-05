import { createClient } from 'redis';
const redisEnabled = process.env.REDIS_ENABLED === 'true';
export const redis = redisEnabled
    ? createClient({
        url: process.env.REDIS_URL
    })
    : null;
if (redis) {
    redis.on('error', (err) => {
        console.error('Redis Error:', err);
    });
    redis.on('connect', () => {
        console.log('🔄 Conectando ao Redis...');
    });
    redis.on('ready', () => {
        console.log('✅ Redis pronto para uso');
    });
}
export async function connectRedis() {
    if (!redis) {
        console.log('⚠️ Redis desabilitado');
        return;
    }
    if (!redis.isOpen) {
        try {
            await redis.connect();
        }
        catch (error) {
            console.error(error.message);
            throw new Error('Erro ao conectar ao Redis');
        }
    }
}
export async function disconnectRedis() {
    if (!redis) {
        return;
    }
    if (redis.isOpen) {
        await redis.quit();
    }
}
