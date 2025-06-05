import { poolPromise } from './db'

export async function snoozeOrder(visitaId: number, orden: number): Promise<void> {
    try {
        const pool = await poolPromise
        await pool.request()
            .input('visitaId', visitaId)
            .input('orden', orden)
            .query('INSERT INTO KDS_Snooze (VisitaID, Orden) VALUES (@visitaId, @orden)')
    } catch (error) {
        console.error('Error al snoozear la orden:', error)
        throw new Error('No se pudo snoozear la orden')
    }
}