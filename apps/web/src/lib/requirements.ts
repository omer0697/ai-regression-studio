"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api-client";
import type { RequirementInfo } from "@/lib/api-client";

export function useRequirementInfo(projectId: number, screenCode: string) {
  return useQuery({
    queryKey: ["requirements", projectId, screenCode] as const,
    queryFn: () => api.listRequirements(projectId, screenCode),
    enabled: Number.isFinite(projectId) && screenCode.length > 0,
  });
}

export function useUpdateRequirementStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, screenCode }: { projectId: number; screenCode: string }) =>
      api.analyzeRequirements(projectId, screenCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["requirements"] });
    },
  });
}
