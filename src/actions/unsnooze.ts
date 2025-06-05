import { poolPromise } from './db'

export async function unsnoozeOrder(visitaId: number, orden: number): Promise<void> {
    try {
        const pool = await poolPromise
        await pool.request()
            .input('visitaId', visitaId)
            .input('orden', orden)
            .query('DELETE FROM KDS_Snooze WHERE VisitaID = @visitaId AND Orden = @orden')
    } catch (error) {
        console.error('Error al hacer unsnooze la orden:', error)
        throw new Error('No se pudo hacer unsnooze la orden')
    }
}