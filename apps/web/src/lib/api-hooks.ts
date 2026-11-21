"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";

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
