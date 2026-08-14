import { getPool } from './db';

export async function snoozeOrder(visitaId: number, orden: number): Promise<void> {
    try {
        const pool = await getPool();
        // DELETE + INSERT para que la fila reciba un KDSsnoozeID nuevo:
        // la posicion en la cola de dormidas se deriva de ese ID, asi que
        // re-snoozear debe mandar la orden al final, no a su posicion vieja.
        await pool.request()
            .input('visitaId', visitaId)
            .input('orden', orden)
            .query(`
        DECLARE @resaltado INT = COALESCE((SELECT TOP 1 Resaltado FROM KDS_Snooze WHERE VisitaID = @visitaId AND Orden = @orden), 0);
        DELETE FROM KDS_Snooze WHERE VisitaID = @visitaId AND Orden = @orden;
        INSERT INTO KDS_Snooze (VisitaID, Orden, Snoozed, Resaltado) VALUES (@visitaId, @orden, 1, @resaltado);
      `);
    } catch (error) {
        console.error('Error al snoozear la orden:', error);
        throw new Error('No se pudo snoozear la orden');
    }
}

export async function unsnoozeOrder(visitaId: number, orden: number): Promise<void> {
    try {
        const pool = await getPool();
        await pool.request()
            .input('visitaId', visitaId)
            .input('orden', orden)
            .query(`
        UPDATE KDS_Snooze SET Snoozed = 0 WHERE VisitaID = @visitaId AND Orden = @orden
      `);
    } catch (error) {
        console.error('Error al hacer unsnooze la orden:', error);
        throw new Error('No se pudo hacer unsnooze la orden');
    }
}

export async function highlightOrder(visitaId: number, orden: number): Promise<void> {
    try {
        const pool = await getPool();
        await pool.request()
            .input('visitaId', visitaId)
            .input('orden', orden)
            .query(`
        IF EXISTS (SELECT 1 FROM KDS_Snooze WHERE VisitaID = @visitaId AND Orden = @orden)
          UPDATE KDS_Snooze SET Resaltado = 1 WHERE VisitaID = @visitaId AND Orden = @orden
        ELSE
          INSERT INTO KDS_Snooze (VisitaID, Orden, Snoozed, Resaltado) VALUES (@visitaId, @orden, 0, 1)
      `);
    } catch (error) {
        console.error('Error al resaltar la orden:', error);
        throw new Error('No se pudo resaltar la orden');
    }
}

export async function unhighlightOrder(visitaId: number, orden: number): Promise<void> {
    try {
        const pool = await getPool();
        await pool.request()
            .input('visitaId', visitaId)
            .input('orden', orden)
            .query(`
        UPDATE KDS_Snooze SET Resaltado = 0 WHERE VisitaID = @visitaId AND Orden = @orden
      `);
    } catch (error) {
        console.error('Error al desresaltar la orden:', error);
        throw new Error('No se pudo desresaltar la orden');
    }
}