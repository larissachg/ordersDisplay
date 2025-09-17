import { OrdenDb } from '@/interfaces/Orden';
import { SnoozeType } from '@/contants/snoozeType';
import { getOrdenesEnCola } from './getOrdenesEnCola';
import { getMainOrdenesDb, getSnoozedOrdenesDb } from './getOrdenesSeparado';

export async function getOrdenesDb(nombreEquipo: string, limit: number, snoozeType: SnoozeType = SnoozeType.enCola): Promise<{ main?: OrdenDb[]; snoozed?: OrdenDb[] }> {
  try {
    if (snoozeType === SnoozeType.separado) {
      const main = await getMainOrdenesDb(nombreEquipo, limit);
      const snoozed = await getSnoozedOrdenesDb(nombreEquipo, limit);
      return { main, snoozed };
    } else {
      const ordenes = await getOrdenesEnCola(nombreEquipo, limit);
      return { main: ordenes, snoozed: [] };
    }
  } catch (error) {
    console.error('Error al obtener las órdenes:', error);
    throw new Error('No se pudieron obtener las órdenes');
  }
}