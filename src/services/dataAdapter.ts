import { createInitialDemoState } from '../data/seedData';
import { VegenAppState } from '../types/domain';

const STORAGE_KEY = 'vegen_finance_spain_mvp_v1';

/**
 * Persistence abstraction separating the interactive prototype adapter
 * from the future PHP 8.x / MySQL REST API adapter on Bluehost.
 */
export interface IVegenDataAdapter {
  readonly mode: 'PROTOTYPE_LOCAL_STORAGE' | 'PHP_MYSQL_API_PLANNED';
  loadState(): VegenAppState;
  saveState(state: VegenAppState): void;
  resetDemoState(): VegenAppState;
}

export class PrototypeLocalStorageAdapter implements IVegenDataAdapter {
  readonly mode = 'PROTOTYPE_LOCAL_STORAGE' as const;

  loadState(): VegenAppState {
    if (typeof window === 'undefined') {
      return createInitialDemoState();
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = createInitialDemoState();
        this.saveState(initial);
        return initial;
      }
      const parsed = JSON.parse(raw) as VegenAppState;
      if (!parsed.personas || !parsed.clientProfiles || !parsed.taxModels) {
        return this.resetDemoState();
      }
      return parsed;
    } catch {
      return this.resetDemoState();
    }
  }

  saveState(state: VegenAppState): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors in demo mode
    }
  }

  resetDemoState(): VegenAppState {
    const initial = createInitialDemoState();
    this.saveState(initial);
    return initial;
  }
}

/**
 * Prepared production adapter boundary for future PHP 8.x / MySQL REST API.
 * Intentionally unimplemented in MVP Phase 1 pending Bluehost environment verification.
 */
export class PhpMySqlApiAdapterBoundary {
  readonly mode = 'PHP_MYSQL_API_PLANNED' as const;
  readonly baseUrl: string;

  constructor(baseUrl = '/api/v1') {
    this.baseUrl = baseUrl;
  }

  async checkServerCapabilities(): Promise<never> {
    throw new Error(
      'Adaptador PHP/MySQL no activado en Fase 1 MVP. Verificar versión PHP 8.x, MySQL, cron y almacenamiento privado antes de conectar.'
    );
  }
}

export const defaultDataAdapter = new PrototypeLocalStorageAdapter();
