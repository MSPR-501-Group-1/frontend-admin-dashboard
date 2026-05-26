/**
 * Pipeline service — fetches and manages ETL execution records.
 */

import { apiClient } from '@/api';
import type { EtlExecution } from '@/types';

/** Fetch all ETL execution records. */
export async function fetchEtlExecutions(): Promise<EtlExecution[]> {
    const response = await apiClient.get<{ success: boolean; data: EtlExecution[] }>('/etl/etlExecutions');
    return response.data;
}

/** Fetch a single ETL execution by ID. */
export async function fetchEtlExecution(id: string): Promise<EtlExecution> {
    const response = await apiClient.get<{ success: boolean; data: EtlExecution }>(`/etl/${id}`);
    return response.data;
}

/** Launch an ETL pipeline. */
export async function launchEtlPipeline(pipeline: 'nutrition' | 'exercises'): Promise<EtlExecution> {
    const response = await apiClient.post<{ success: boolean; data: EtlExecution }>(
        `/etl/${pipeline}`,
        {},
        { timeoutMs: 60_000 }
    );
    return response.data;
}

/** Approve/Load an ETL execution (update status to loaded). */
export async function approveEtlExecution(
    payload: { id: string; pipeline: 'nutrition' | 'exercises' }
): Promise<void> {
    await apiClient.post<void>(`/etl/validate/${payload.id}`, { pipeline: payload.pipeline });
}

/** Reject an ETL execution (update status to rejected). */
export async function rejectEtlExecution(id: string): Promise<void> {
    await apiClient.post<void>(`/etl/reject/${id}`, {});
}

/** Delete an ETL execution. */
export async function deleteEtlExecution(id: string): Promise<void> {
    await apiClient.delete<void>(`/etl/${id}`);
}

export function downloadEtlCsv(pipeline: string, executionId: string) {
    const entityByPipeline: Record<string, string> = {
        nutrition: 'ingredient',
        exercises: 'exercise',
    };
    const filename = `${entityByPipeline[pipeline] || pipeline}_${executionId}.csv`;
    const url = `/files/${pipeline}/${executionId}`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}