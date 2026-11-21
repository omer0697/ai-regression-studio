"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import type { AiSettingsUpdate } from "@/lib/api-client";

export const queryKeys = {
  dashboard: ["dashboard"] as const,
  projects: ["projects"] as const,
  project: (id: number) => ["projects", id] as const,
  environments: (projectId: number) => ["projects", projectId, "environments"] as const,
  screens: (projectId: number) => ["projects", projectId, "screens"] as const,
  executions: ["executions"] as const,
  projectExecutions: (projectId: number) => ["projects", projectId, "executions"] as const,
  execution: (id: number) => ["executions", id] as const,
};

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.getDashboard(),
    refetchInterval: 5000,
  });
}

export function useProjects() {
  return useQuery({ queryKey: queryKeys.projects, queryFn: () => api.listProjects() });
}

export function useProject(id: number) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.getProject(id),
    enabled: Number.isFinite(id),
  });
}

export function useEnvironments(projectId: number) {
  return useQuery({
    queryKey: queryKeys.environments(projectId),
    queryFn: () => api.listEnvironments(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useScreens(projectId: number) {
  return useQuery({
    queryKey: queryKeys.screens(projectId),
    queryFn: () => api.listScreens(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useExecutions() {
  return useQuery({ queryKey: queryKeys.executions, queryFn: () => api.listExecutions() });
}

export function useProjectExecutions(projectId: number) {
  return useQuery({
    queryKey: queryKeys.projectExecutions(projectId),
    queryFn: () => api.listProjectExecutions(projectId),
    enabled: Number.isFinite(projectId),
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.createProject>[0]) => api.createProject(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useUpdateProject(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof api.updateProject>[1]) => api.updateProject(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(id) });
    },
  });
}

export function useDeleteProject(id: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useCreateEnvironment(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.createEnvironment(projectId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.environments(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

export function useUpdateEnvironment(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ envId, body }: { envId: number; body: Record<string, unknown> }) =>
      api.updateEnvironment(projectId, envId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.environments(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

export function useDeleteEnvironment(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (envId: number) => api.deleteEnvironment(projectId, envId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.environments(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

export function useCreateScreen(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.createScreen(projectId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.screens(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

export function useUpdateScreen(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ screenId, body }: { screenId: number; body: Record<string, unknown> }) =>
      api.updateScreen(projectId, screenId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.screens(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

export function useDeleteScreen(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (screenId: number) => api.deleteScreen(projectId, screenId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.screens(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}

export function useStartExecution(projectId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { screenId: number; mode: string }) => api.startExecution(projectId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projectExecutions(projectId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
    },
  });
}

export function useExecution(id: number) {
  return useQuery({
    queryKey: queryKeys.execution(id),
    queryFn: () => api.getExecution(id),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "COMPLETED" || status === "FAILED" || status === "NOT_SUPPORTED" || status === "ERROR" || status === "CANCELLED") {
        return false;
      }
      return 3000;
    },
  });
}

export function useExecutionArtifacts(id: number) {
  return useQuery({
    queryKey: ["executions", id, "artifacts"] as const,
    queryFn: () => api.listExecutionArtifacts(id),
    enabled: Number.isFinite(id),
    refetchInterval: 5000,
  });
}

export function useExecutionElements(id: number) {
  return useQuery({
    queryKey: ["executions", id, "elements"] as const,
    queryFn: () => api.listExecutionElements(id),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => (query.state.data?.length ? false : 5000),
  });
}

export function useExecutionObservations(id: number) {
  return useQuery({
    queryKey: ["executions", id, "observations"] as const,
    queryFn: () => api.listExecutionObservations(id),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => (query.state.data?.length ? false : 5000),
  });
}

export function useExecutionFindings(id: number) {
  return useQuery({
    queryKey: ["executions", id, "findings"] as const,
    queryFn: () => api.listExecutionFindings(id),
    enabled: Number.isFinite(id),
    refetchInterval: (query) => (query.state.data?.length ? false : 5000),
  });
}

export function useBugs(status?: string) {
  return useQuery({
    queryKey: ["bugs", status ?? "all"] as const,
    queryFn: () => api.listBugs(status),
  });
}

export function useUpdateBugStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: "CONFIRMED" | "DISMISSED" }) =>
      api.updateBugStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bugs"] });
    },
  });
}

export function useAiStatus() {
  return useQuery({ queryKey: ["ai", "status"] as const, queryFn: () => api.getAiStatus() });
}

export function useAiSettings() {
  return useQuery({ queryKey: ["ai", "settings"] as const, queryFn: () => api.getAiSettings() });
}

export function useUpdateAiSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: AiSettingsUpdate) => api.updateAiSettings(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai", "settings"] });
      void queryClient.invalidateQueries({ queryKey: ["ai", "status"] });
    },
  });
}

export function useTestAiSettings() {
  return useMutation({ mutationFn: () => api.testAiSettings() });
}

export function useScenarios(projectId?: number) {
  return useQuery({
    queryKey: ["scenarios", projectId ?? "all"] as const,
    queryFn: () => api.listScenarios(projectId),
  });
}

export function useApproveScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.approveScenario(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });
}

export function useRejectScenario() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.rejectScenario(id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });
}

export function useProposeAiPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, screenId, command }: { projectId: number; screenId: number; command: string }) =>
      api.proposeAiPlan(projectId, screenId, command),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["scenarios"] });
    },
  });
}
