import { createClient } from 'redis';
const isDocker = process.env.NODE_ENV === 'production';
export const redis = createClient({
    url: isDocker
        ? 'redis://redis:6379'
        : 'redis://localhost:6379'
});
redis.on('error', (err) => {
    console.error('❌ Redis error:', err);
});
redis.on('connect', () => {
    console.log('🔌 Redis conectando...');
});
redis.on('ready', () => {
    console.log('🧠 Redis pronto');
});
export async function connectRedis() {
    if (!redis.isOpen) {
        await redis.connect();
    }
}
