import { PoolClient } from 'pg';

export declare function query(sql: string, params?: any[]): Promise<any>;
export declare function getClient(): Promise<PoolClient>;