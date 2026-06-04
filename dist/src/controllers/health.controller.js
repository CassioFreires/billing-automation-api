export class HealthController {
    async check(req, res) {
        return res.status(200).json({
            status: 'UP',
            timestamp: new Date().toISOString()
        });
    }
}
