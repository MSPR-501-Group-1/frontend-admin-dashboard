import { useState, useCallback } from 'react';
import {
    Box,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Typography,
    Chip,
    CircularProgress,
    Alert,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DeleteIcon from '@mui/icons-material/Delete';
import type { GridColDef } from '@mui/x-data-grid';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    fetchEtlExecutions,
    launchEtlPipeline,
    approveEtlExecution,
    rejectEtlExecution,
    deleteEtlExecution,
} from '@/services/pipeline.service';
import { LoadingState, ErrorState, PageHeader } from '@/components/feedback';
import { DataTable } from '@/components/shared';
import { getErrorMessage } from '@/lib/error.utils';
import type { EtlExecution } from '@/types';

// ─── Display Config ─────────────────────────────────────────

const PIPELINES = [
    { value: 'nutrition', label: 'Nutrition' },
    { value: 'exercises', label: 'Exercices' },
] as const;

const CSV_ENTITY_BY_PIPELINE: Record<'nutrition' | 'exercises', 'ingredient' | 'exercise'> = {
    nutrition: 'ingredient',
    exercises: 'exercise',
};

// ─── Launch Dialog ──────────────────────────────────────────

interface LaunchDialogProps {
    open: boolean;
    onClose: () => void;
    onLaunch: (pipeline: 'nutrition' | 'exercises') => void;
    isLoading: boolean;
}

function LaunchDialog({ open, onClose, onLaunch, isLoading }: LaunchDialogProps) {
    const [selectedPipeline, setSelectedPipeline] = useState<'nutrition' | 'exercises'>('nutrition');

    const handleLaunch = () => {
        onLaunch(selectedPipeline);
        onClose();
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>Lancer une pipeline ETL</DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <FormControl fullWidth>
                    <InputLabel>Pipeline</InputLabel>
                    <Select
                        value={selectedPipeline}
                        label="Pipeline"
                        onChange={(e: SelectChangeEvent) =>
                            setSelectedPipeline(e.target.value as 'nutrition' | 'exercises')
                        }
                    >
                        {PIPELINES.map(({ value, label }) => (
                            <MenuItem key={value} value={value}>
                                {label}
                            </MenuItem>
                        ))}
                    </Select>
                </FormControl>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Annuler</Button>
                <Button
                    onClick={handleLaunch}
                    variant="contained"
                    disabled={isLoading}
                    startIcon={isLoading ? <CircularProgress size={20} /> : <PlayArrowIcon />}
                >
                    {isLoading ? 'Lancement...' : 'Lancer'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// ─── Validation Dialog ──────────────────────────────────────

interface ValidationDialogProps {
    open: boolean;
    execution: EtlExecution | null;
    onClose: () => void;
    onApprove: () => void;
    onReject: () => void;
    onDelete: () => void;
    isLoading: boolean;
}

function ValidationDialog({
    open,
    execution,
    onClose,
    onApprove,
    onReject,
    onDelete,
    isLoading,
}: ValidationDialogProps) {
    if (!execution) return null;

    // Determine available actions based on status
    const isTransformed = execution.status === 'TRANSFORMED';
    const canAcceptOrReject = isTransformed;
    const canDelete = ['FAILED', 'REJECTED', 'LOADED'].includes(execution.status);
    const isPending = execution.status === 'PENDING';

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle>
                {isTransformed ? 'Valider l\'exécution ETL' : 'Détails de l\'exécution ETL'}
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Statut
                        </Typography>
                        <Typography variant="body1" fontWeight={600}>
                            {execution.status === 'LOADED' && 'Succès'}
                            {execution.status === 'REJECTED' && 'Rejeté'}
                            {execution.status === 'TRANSFORMED' && 'Transformé'}
                            {execution.status === 'FAILED' && 'Échoué'}
                            {execution.status === 'PENDING' && 'En attente'}
                        </Typography>
                    </Box>
                    <Box>
                        <Typography variant="body2" color="text.secondary">
                            Enregistrements extraits
                        </Typography>
                        <Typography variant="body1" fontWeight={600}>
                            {execution.records_extracted.toLocaleString('fr-FR')}
                        </Typography>
                    </Box>
                    {execution.records_errors > 0 && (
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Erreurs
                            </Typography>
                            <Typography variant="body1" fontWeight={600} color="error">
                                {execution.records_errors.toLocaleString('fr-FR')}
                            </Typography>
                        </Box>
                    )}
                    {isTransformed && (
                        <Alert severity="info">
                            Cliquez sur <strong>Accepter</strong> pour valider et charger les données en base,
                            ou <strong>Rejeter</strong> pour ignorer ce lot.
                        </Alert>
                    )}
                    {isPending && (
                        <Alert severity="warning">
                            Cette exécution est en attente de traitement. Aucune action n'est possible pour le moment.
                        </Alert>
                    )}
                    {canDelete && !isTransformed && (
                        <Alert severity="info">
                            La seule action disponible pour ce statut est la suppression.
                        </Alert>
                    )}
                </Box>
            </DialogContent>
            <DialogActions>
                {canAcceptOrReject && (
                    <Button onClick={onReject} disabled={isLoading} color="error">
                        Rejeter
                    </Button>
                )}
                {canDelete && (
                    <Button onClick={onDelete} disabled={isLoading} color="error" startIcon={<DeleteIcon />}>
                        Supprimer
                    </Button>
                )}
                <Button onClick={onClose} disabled={isLoading}>
                    Annuler
                </Button>
                {canAcceptOrReject && (
                    <Button
                        onClick={onApprove}
                        variant="contained"
                        disabled={isLoading}
                        startIcon={isLoading ? <CircularProgress size={20} /> : <CheckCircleOutlineIcon />}
                    >
                        {isLoading ? 'Chargement...' : 'Accepter'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

// ─── Main Page ──────────────────────────────────────────────

export default function PipelinePage() {
    const queryClient = useQueryClient();
    const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
    const [validationDialogOpen, setValidationDialogOpen] = useState(false);
    const [selectedExecution, setSelectedExecution] = useState<EtlExecution | null>(null);

    // Fetch executions
    const { data: executions = [], isLoading, isError, error } = useQuery({
        queryKey: ['etl-executions'],
        queryFn: fetchEtlExecutions,
        refetchInterval: 5000, // Poll every 5s
    });

    // Launch mutation
    const launchMutation = useMutation({
        mutationFn: launchEtlPipeline,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['etl-executions'] });
        },
    });

    // Approve mutation
    const approveMutation = useMutation({
        mutationFn: approveEtlExecution,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['etl-executions'] });
            setValidationDialogOpen(false);
            setSelectedExecution(null);
        },
    });

    // Reject mutation
    const rejectMutation = useMutation({
        mutationFn: rejectEtlExecution,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['etl-executions'] });
            setValidationDialogOpen(false);
            setSelectedExecution(null);
        },
    });

    // Delete mutation
    const deleteMutation = useMutation({
        mutationFn: deleteEtlExecution,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['etl-executions'] });
            setValidationDialogOpen(false);
            setSelectedExecution(null);
        },
    });

    // Handlers
    const handleLaunch = useCallback((pipeline: 'nutrition' | 'exercises') => {
        launchMutation.mutate(pipeline);
    }, [launchMutation]);

    const handleApprove = useCallback(() => {
        if (selectedExecution) {
            approveMutation.mutate({
                id: selectedExecution.id,
                pipeline: selectedExecution.name as 'nutrition' | 'exercises',
            });
        }
    }, [selectedExecution, approveMutation]);

    const handleReject = useCallback(() => {
        if (selectedExecution) {
            rejectMutation.mutate(selectedExecution.id);
        }
    }, [selectedExecution, rejectMutation]);

    const handleDelete = useCallback(() => {
        if (selectedExecution) {
            deleteMutation.mutate(selectedExecution.id);
        }
    }, [selectedExecution, deleteMutation]);

    // Columns
    const columns: GridColDef<EtlExecution>[] = [
        {
            field: 'id',
            headerName: 'ID',
            width: 120,
            flex: 0.5,
        },
        {
            field: 'name',
            headerName: 'Pipeline',
            width: 150,
            flex: 0.5,
            valueFormatter: (value) => {
                const pipeline = PIPELINES.find((p) => p.value === value);
                return pipeline ? pipeline.label : value;
            },
        },
        {
            field: 'status',
            headerName: 'Statut',
            width: 130,
            flex: 0.5,
            // If status is loaded -> green
            // If status is rejected -> red
            // If status is transformed -> blue
            // If status is failed -> red
            // If status is pending -> orange
            renderCell: ({ value }) => {
                let color: 'success' | 'error' | 'warning' | 'info' | 'default' = 'default';
                let label = value;

                switch (value) {
                    case 'LOADED':
                        color = 'success';
                        label = 'Succès';
                        break;
                    case 'REJECTED':
                        color = 'error';
                        label = 'Rejeté';
                        break;
                    case 'TRANSFORMED':
                        color = 'info';
                        label = 'Transformé';
                        break;
                    case 'FAILED':
                        color = 'error';
                        label = 'Échoué';
                        break;
                    case 'PENDING':
                        color = 'warning';
                        label = 'En attente';
                        break;
                }

                return <Chip label={label} color={color} size="small" />;
            },
        },
        {
            field: 'started_at',
            headerName: 'Démarré',
            width: 180,
            flex: 1,
            valueFormatter: (value: string) =>
                new Date(value).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                }),
        },
        {
            field: 'completed_at',
            headerName: 'Complété',
            width: 180,
            flex: 1,
            valueFormatter: (value?: string) =>
                value
                    ? new Date(value).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                    : '—',
        },
        {
            field: 'records_extracted',
            headerName: 'Extraits',
            width: 110,
            valueFormatter: (value: number) => value.toLocaleString('fr-FR'),
        },
        {
            field: 'records_errors',
            headerName: 'Erreurs',
            width: 110,
            renderCell: ({ value }) => (
                <Typography
                    variant="body2"
                    color={value > 0 ? 'error' : 'text.secondary'}
                    fontWeight={value > 0 ? 600 : 400}
                >
                    {(value as number).toLocaleString('fr-FR')}
                </Typography>
            ),
        },
        {
            field: 'actions',
            headerName: 'Actions',
            width: 120,
            sortable: false,
            filterable: false,
            renderCell: ({ row }) => {
                // Determine action availability
                const isPending = row.status === 'PENDING';
                const isDisabled = isPending || (approveMutation.isPending || rejectMutation.isPending || deleteMutation.isPending);

                return (
                    <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                            setSelectedExecution(row);
                            setValidationDialogOpen(true);
                        }}
                        disabled={isDisabled}
                        startIcon={isDisabled ? <CircularProgress size={16} /> : <CheckCircleOutlineIcon />}
                    >
                        {isPending ? 'Attente' : 'Actions'}
                    </Button>
                );
            },
        },
        {
            field: 'csv',
            headerName: 'CSV',
            width: 120,
            sortable: false,
            filterable: false,
            renderCell: ({ row }) => {
                const pipelineValue = PIPELINES.find(p => p.value === row.name)?.value;

                const handleDownload = () => {
                    if (!pipelineValue || !row.id) return;

                    const filename = `${CSV_ENTITY_BY_PIPELINE[pipelineValue]}_${row.id}.csv`;
                    const url = `/files/${pipelineValue}/${row.id}`;

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                };


                return (
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={handleDownload}
                        disabled={!row.id || !row.name}
                    >
                        CSV
                    </Button>
                );
            },
        }
    ];

    // UI
    if (isLoading) return <LoadingState />;
    if (isError) return <ErrorState message={getErrorMessage(error, 'Erreur lors du chargement des exécutions ETL.')} />;

    return (
        <Box>
            <PageHeader
                title="Gestion du Pipeline ETL"
                subtitle="Lancez des pipelines d'ETL, consultez l'historique des exécutions et validez les résultats"
            />

            {/* Launch Button */}
            <Box sx={{ mb: 2 }}>
                <Button
                    variant="contained"
                    startIcon={<PlayArrowIcon />}
                    onClick={() => setLaunchDialogOpen(true)}
                    disabled={launchMutation.isPending}
                >
                    {launchMutation.isPending ? 'Lancement en cours...' : 'Lancer une pipeline'}
                </Button>
            </Box>

            {/* Error message */}
            {launchMutation.isError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {getErrorMessage(launchMutation.error, 'Erreur lors du lancement de la pipeline.')}
                </Alert>
            )}

            {approveMutation.isError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {getErrorMessage(approveMutation.error, 'Erreur lors du chargement des données.')}
                </Alert>
            )}

            {/* Executions Table */}
            {executions.length === 0 ? (
                <Alert severity="info">Aucune exécution pour le moment.</Alert>
            ) : (
                <DataTable
                    rows={executions}
                    columns={columns}
                    ariaLabel="Tableau des exécutions ETL"
                    defaultSort={{ field: 'started_at', sort: 'desc' }}
                />
            )}

            {/* Dialogs */}
            <LaunchDialog
                open={launchDialogOpen}
                onClose={() => setLaunchDialogOpen(false)}
                onLaunch={handleLaunch}
                isLoading={launchMutation.isPending}
            />

            <ValidationDialog
                open={validationDialogOpen}
                execution={selectedExecution}
                onClose={() => setValidationDialogOpen(false)}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
                isLoading={approveMutation.isPending || rejectMutation.isPending || deleteMutation.isPending}
            />
        </Box>
    );
}
